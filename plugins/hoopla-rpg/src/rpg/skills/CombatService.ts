/**
 * Combat Service
 * 
 * Handles combat skill progression through enemy interactions.
 * Players can attack different tier enemies to gain combat XP.
 */

import { OL, PS } from "omegga";
import { PlayerService, PlayerId, RPGPlayer } from "../player/PlayerService";
import { UnifiedXPService } from "../progression/UnifiedXPService";

export interface EnemyTier {
  tier: number;
  minCombatLevel: number;
  baseHitsRequired: number;
  xpReward: number;
  name: string;
}

export interface EnemyState {
  currentHits: number;
  maxHits: number;
  tier: number;
  lastAttacker?: string;
  defeatedAt?: number; // Timestamp when enemy was defeated
}

export class CombatService {
  private omegga: OL;
  private store: PS<any>;
  private playerService: PlayerService;
  private unifiedXPService: UnifiedXPService;
  private enemyStates: Map<string, EnemyState> = new Map();
  private playerClickTimes: Map<string, number[]> = new Map();
  private readonly MAX_CLICKS_PER_SECOND = 5; // Slower than other skills due to combat nature

  // Enemy tier definitions
  private readonly ENEMY_TIERS: EnemyTier[] = [
    { tier: 1, minCombatLevel: 0, baseHitsRequired: 10, xpReward: 50, name: "Knight" },
    { tier: 2, minCombatLevel: 5, baseHitsRequired: 15, xpReward: 100, name: "Orc" },
    { tier: 3, minCombatLevel: 10, baseHitsRequired: 20, xpReward: 200, name: "Troll" },
    { tier: 4, minCombatLevel: 15, baseHitsRequired: 25, xpReward: 350, name: "Dragon" },
    { tier: 5, minCombatLevel: 20, baseHitsRequired: 30, xpReward: 500, name: "Demon Lord" }
  ];

  constructor(omegga: OL, store: PS<any>, playerService: PlayerService, unifiedXPService: UnifiedXPService) {
    this.omegga = omegga;
    this.store = store;
    this.playerService = playerService;
    this.unifiedXPService = unifiedXPService;
  }

  /**
   * Handle enemy attack interaction
   */
  async handleEnemyAttack(playerId: string, brickId: string, consoleMessage: string): Promise<{
    success: boolean;
    message: string;
    xpGained?: number;
    levelUp?: boolean;
  }> {
    try {
      // Rate limiting check - silently ignore if rate limited
      if (!this.canPlayerClick(playerId)) {
        return { success: false, message: "" };
      }

      // Parse enemy tier from console message
      const enemyTier = this.parseEnemyTier(consoleMessage);
      if (!enemyTier) {
        return { success: false, message: "Invalid enemy type." };
      }

      // Get player data
      const playerData = await this.playerService.getPlayerData({ id: playerId });
      const combatLevel = playerData.skills?.combat?.level || 0;

      // Check if player meets minimum combat level requirement
      if (combatLevel < enemyTier.minCombatLevel) {
        return { 
          success: false, 
          message: `You need at least combat level ${enemyTier.minCombatLevel} to attack ${enemyTier.name}s.` 
        };
      }

      // Get or create enemy state
      const enemyState = this.getOrCreateEnemyState(brickId, enemyTier, combatLevel);

      // Check if enemy is already defeated
      if (enemyState.currentHits >= enemyState.maxHits) {
        if (enemyState.defeatedAt) {
          const now = Date.now();
          const timeSinceDefeat = now - enemyState.defeatedAt;
          const respawnTime = 60000; // 60 seconds
          const remainingTime = Math.max(0, respawnTime - timeSinceDefeat);
          const remainingSeconds = Math.ceil(remainingTime / 1000);
          
          if (remainingSeconds > 0) {
            return { 
              success: false, 
              message: `This ${enemyTier.name} has been defeated! Respawns in ${remainingSeconds} seconds.` 
            };
          } else {
            // Enemy should have respawned, reset the state
            this.enemyStates.delete(brickId);
            // Continue with normal attack logic below
          }
        } else {
          return { success: false, message: "This enemy has already been defeated!" };
        }
      }

      // Record the attack
      enemyState.currentHits++;
      enemyState.lastAttacker = playerId;

      // Check if enemy is defeated
      if (enemyState.currentHits >= enemyState.maxHits) {
        // Enemy defeated - award XP
        const xpGained = enemyTier.xpReward;
        
        // Grant XP using unified service (player XP + combat skill XP + class XP)
        const xpResult = await this.unifiedXPService.grantXP(playerId, {
          playerXP: xpGained,
          skillXP: xpGained,
          skillType: 'combat',
          grantClassXP: true
        }, playerData);

        // Record when the enemy was defeated
        enemyState.defeatedAt = Date.now();

        // Reset enemy state after a delay (60 seconds)
        setTimeout(() => {
          this.enemyStates.delete(brickId);
        }, 60000);

        return {
          success: true,
          message: `You defeated the ${enemyTier.name}! +${xpGained} Combat XP`,
          xpGained,
          levelUp: xpResult.playerLeveledUp || xpResult.skillLeveledUp
        };
      } else {
        // Enemy still alive
        const hitsRemaining = enemyState.maxHits - enemyState.currentHits;
        return {
          success: true,
          message: `You hit the ${enemyTier.name}! ${hitsRemaining} hits remaining.`
        };
      }

    } catch (error) {
      console.error(`[CombatService] Error handling enemy attack:`, error);
      return { success: false, message: "An error occurred during combat." };
    }
  }

  /**
   * Parse enemy tier from console message
   */
  private parseEnemyTier(consoleMessage: string): EnemyTier | null {
    const tierMatch = consoleMessage.match(/rpg_enemy_tier_(\d+)/);
    if (!tierMatch) {
      return null;
    }

    const tier = parseInt(tierMatch[1]);
    return this.ENEMY_TIERS.find(t => t.tier === tier) || null;
  }

  /**
   * Get or create enemy state for a brick
   */
  private getOrCreateEnemyState(brickId: string, enemyTier: EnemyTier, combatLevel: number): EnemyState {
    if (!this.enemyStates.has(brickId)) {
      // Calculate hits required based on combat level
      const hitsRequired = this.calculateHitsRequired(enemyTier.baseHitsRequired, combatLevel);
      
      this.enemyStates.set(brickId, {
        currentHits: 0,
        maxHits: hitsRequired,
        tier: enemyTier.tier
      });
    }

    return this.enemyStates.get(brickId)!;
  }

  /**
   * Calculate hits required based on combat level
   * Higher combat level = fewer hits required
   */
  private calculateHitsRequired(baseHits: number, combatLevel: number): number {
    // Reduce hits by 1 for every 3 combat levels, minimum 1 hit
    const reduction = Math.floor(combatLevel / 3);
    return Math.max(1, baseHits - reduction);
  }

  /**
   * Check if player can perform a click action (rate limiting)
   */
  private canPlayerClick(playerId: string): boolean {
    const now = Date.now();
    const playerClicks = this.playerClickTimes.get(playerId) || [];
    
    // Remove clicks older than 1 second
    const recentClicks = playerClicks.filter(time => now - time < 1000);
    
    // Check if under rate limit
    if (recentClicks.length >= this.MAX_CLICKS_PER_SECOND) {
      return false;
    }
    
    // Add current click
    recentClicks.push(now);
    this.playerClickTimes.set(playerId, recentClicks);
    
    return true;
  }

  /**
   * Get combat skill information for a player
   */
  async getCombatInfo(playerId: PlayerId): Promise<{
    level: number;
    experience: number;
    xpForNextLevel: number;
    progress: number;
    canFight: EnemyTier[];
    cannotFight: EnemyTier[];
    nextUnlock: EnemyTier | null;
  }> {
    const player = await this.playerService.getPlayerData(playerId);
    const combatLevel = player.skills?.combat?.level || 0;
    const combatXP = player.skills?.combat?.experience || 0;
    
    // Get XP progress using unified service
    const xpProgress = await this.unifiedXPService.getXPProgress(playerId.id, 'combat');
    const combatProgress = xpProgress.skill;
    
    const canFight: EnemyTier[] = [];
    const cannotFight: EnemyTier[] = [];
    let nextUnlock: EnemyTier | null = null;
    
    for (const tier of this.ENEMY_TIERS) {
      if (combatLevel >= tier.minCombatLevel) {
        canFight.push(tier);
      } else {
        cannotFight.push(tier);
        if (!nextUnlock) {
          nextUnlock = tier;
        }
      }
    }
    
    return {
      level: combatLevel,
      experience: combatXP,
      xpForNextLevel: combatProgress?.xpForNextLevel || 0,
      progress: combatProgress?.progress || 0,
      canFight,
      cannotFight,
      nextUnlock
    };
  }


  /**
   * Get all enemy tiers
   */
  getEnemyTiers(): EnemyTier[] {
    return [...this.ENEMY_TIERS];
  }

  /**
   * Clear enemy states (useful for debugging or server restart)
   */
  clearEnemyStates(): void {
    this.enemyStates.clear();
  }
}
