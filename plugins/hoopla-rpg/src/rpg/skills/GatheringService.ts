/**
 * Gathering Service
 * 
 * Handles gathering mechanics, item collection, and gathering interactions
 * for the RPG system.
 */

import { OL } from "omegga";
import { PlayerId, RPGPlayer, PlayerService } from '../player/PlayerService';
import { InventoryService } from '../player/InventoryService';
import { UnifiedXPService } from '../progression/UnifiedXPService';
import { ResourceService } from '../economy/ResourceService';
import { ProgressBarService } from '../utils/ProgressBar';
import { BrickTrigger } from '../world/NodeService';
import { RateLimitService } from '../utils/RateLimitService';

/**
 * Gathering item definitions
 */
interface GatheringItem {
  id: string;
  name: string;
  consolePrint: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  baseExperience: number;
  baseSellPrice: number;
  maxLevel: number;
}

/**
 * Service class for managing gathering mechanics
 */
export class GatheringService {
  private omegga: OL;
  private inventoryService: InventoryService;
  private unifiedXPService: UnifiedXPService;
  private resourceService: ResourceService;
  private progressBarService: ProgressBarService;
  private rateLimitService: RateLimitService;
  private playerService: PlayerService;

  // Gathering items configuration
  private gatheringItems: { [key: string]: GatheringItem } = {
    lavender: {
      id: 'lavender',
      name: 'Lavender',
      consolePrint: 'rpg_harvest_lavender',
      rarity: 'common',
      baseExperience: 10,
      baseSellPrice: 5, // Lower than usual
      maxLevel: 30
    },
    red_berry: {
      id: 'red_berry',
      name: 'Red Berry',
      consolePrint: 'rpg_harvest_red_berry',
      rarity: 'uncommon',
      baseExperience: 15,
      baseSellPrice: 8, // Lower than usual
      maxLevel: 30
    },
    nightflower: {
      id: 'nightflower',
      name: 'Nightflower',
      consolePrint: 'rpg_harvest_nightflower',
      rarity: 'rare',
      baseExperience: 25,
      baseSellPrice: 15, // Higher value for rare item
      maxLevel: 30
    }
  };

  // Cooldown tracking for gathering nodes
  private nodeCooldowns: Map<string, number> = new Map();
  private readonly COOLDOWN_DURATION = 60000; // 60 seconds in milliseconds

  constructor(
    omegga: OL,
    inventoryService: InventoryService,
    unifiedXPService: UnifiedXPService,
    resourceService: ResourceService,
    progressBarService: ProgressBarService,
    rateLimitService: RateLimitService,
    playerService: PlayerService
  ) {
    this.omegga = omegga;
    this.inventoryService = inventoryService;
    this.unifiedXPService = unifiedXPService;
    this.resourceService = resourceService;
    this.progressBarService = progressBarService;
    this.rateLimitService = rateLimitService;
    this.playerService = playerService;
  }

  /**
   * Handle gathering interaction
   */
  async handleGatheringInteraction(playerId: string, trigger: BrickTrigger): Promise<void> {
    try {
      const player = this.omegga.getPlayer(playerId);
      if (!player) {
        return;
      }

      const playerName = player.name;
      const message = trigger.message;

      // Find the gathering item by console print
      const gatheringItem = this.findGatheringItemByConsolePrint(message);
      if (!gatheringItem) {
        return;
      }

      // Check if node is on cooldown
      const nodeId = this.generateNodeId(trigger);
      if (this.isNodeOnCooldown(nodeId)) {
        const remainingTime = this.getRemainingCooldown(nodeId);
        this.omegga.middlePrint(playerId, `This gathering node is on cooldown for ${Math.ceil(remainingTime / 1000)} more seconds.`);
        return;
      }

      // Rate limiting check
      const rateLimitKey = `gathering_${playerId}`;
      if (!this.rateLimitService.canPlayerInteract(playerId, rateLimitKey)) {
        this.omegga.middlePrint(playerId, "You're gathering too quickly! Please wait a moment.");
        return;
      }

      // Get player data
      const playerData = await this.playerService.getPlayerData({ id: playerId });
      if (!playerData) {
        console.log(`[Hoopla RPG] No player data found for gathering: ${playerId}`);
        return;
      }

      // Get gathering skill level
      const gatheringLevel = playerData.skills?.gathering?.level || 0;

      // Calculate gathering amount with skill bonus
      const baseAmount = 1;
      const bonusMultiplier = this.calculateGatheringBonus(gatheringLevel);
      const totalAmount = Math.floor(baseAmount * bonusMultiplier);

      // Add items to inventory
      for (let i = 0; i < totalAmount; i++) {
        this.inventoryService.addToInventory(playerData, gatheringItem.name);
      }

      // Add gathering experience
      const experienceGained = gatheringItem.baseExperience;
      
      // Grant XP using unified service (player XP + gathering skill XP + class XP)
      const xpResult = await this.unifiedXPService.grantXP(playerId, {
        playerXP: experienceGained,
        skillXP: experienceGained,
        skillType: 'gathering',
        grantClassXP: true
      }, playerData);

      // Set node cooldown
      this.setNodeCooldown(nodeId);

      // Note: Player data is already saved by the XP services

      // Display results - get updated inventory count
      const itemCount = this.inventoryService.countItem(playerData, gatheringItem.name);
      const itemDisplayName = this.getItemDisplayName(gatheringItem);
      
      // Format message to match mining/fishing style
      let resultMessage = `Gathered ${totalAmount}x ${itemDisplayName} (<color="ff0">x${itemCount}</color> in bag), Gained ${experienceGained}XP and ${experienceGained} Gathering XP`;
      
      // Add skill bonus info if applicable
      if (totalAmount > 1) {
        resultMessage += ` (${gatheringLevel > 0 ? `+${Math.floor((bonusMultiplier - 1) * 100)}% skill bonus` : 'no skill bonus'})`;
      }

      // Get gathering skill progress for display
      const xpProgress = await this.unifiedXPService.getXPProgress(playerId, 'gathering');
      const gatheringProgress = xpProgress.skill;
      
      if (gatheringProgress) {
        const maxLevelText = gatheringProgress.level >= 30 ? " (MAX)" : "";
        resultMessage += ` - Gathering ${gatheringProgress.level}${maxLevelText} | ${gatheringProgress.xp}/${gatheringProgress.xpForNextLevel}XP (${Math.round(gatheringProgress.progress)}%)`;
      }

      this.omegga.middlePrint(playerId, resultMessage);

    } catch (error) {
      this.omegga.middlePrint(playerId, "An error occurred while gathering. Please try again.");
    }
  }

  /**
   * Find gathering item by console print message
   */
  private findGatheringItemByConsolePrint(message: string): GatheringItem | null {
    for (const item of Object.values(this.gatheringItems)) {
      if (item.consolePrint === message) {
        return item;
      }
    }
    return null;
  }

  /**
   * Calculate gathering bonus based on skill level
   * Max level (30) gives 5x bonus
   */
  private calculateGatheringBonus(skillLevel: number): number {
    if (skillLevel <= 0) return 1.0;
    if (skillLevel >= 30) return 5.0;
    
    // Gradual scaling from 1x to 5x over 30 levels
    // Using a curve that starts slow and accelerates
    const progress = skillLevel / 30;
    const bonus = 1 + (progress * progress * 4); // Quadratic curve: 1x to 5x
    
    return Math.max(1.0, bonus);
  }

  /**
   * Get item display name with rarity color
   */
  private getItemDisplayName(item: GatheringItem): string {
    const rarityColors = {
      common: 'fff',    // White
      uncommon: '0f0',  // Green
      rare: '08f',      // Blue
      epic: '80f',      // Purple
      legendary: 'f80'  // Orange
    };

    const color = rarityColors[item.rarity];
    return `<color="${color}">[${item.name}]</color>`;
  }

  /**
   * Generate unique node ID for cooldown tracking
   */
  private generateNodeId(trigger: BrickTrigger): string {
    return `gathering_${trigger.message}_${trigger.id}`;
  }

  /**
   * Check if node is on cooldown
   */
  private isNodeOnCooldown(nodeId: string): boolean {
    const cooldownEnd = this.nodeCooldowns.get(nodeId);
    if (!cooldownEnd) return false;
    
    return Date.now() < cooldownEnd;
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  private getRemainingCooldown(nodeId: string): number {
    const cooldownEnd = this.nodeCooldowns.get(nodeId);
    if (!cooldownEnd) return 0;
    
    return Math.max(0, cooldownEnd - Date.now());
  }

  /**
   * Set node cooldown
   */
  private setNodeCooldown(nodeId: string): void {
    this.nodeCooldowns.set(nodeId, Date.now() + this.COOLDOWN_DURATION);
  }

  /**
   * Get gathering statistics for a player
   */
  getGatheringStats(player: RPGPlayer): {
    level: number;
    experience: number;
    canGather: string[];
    bonusMultiplier: number;
    nextBonusLevel: number | null;
  } {
    const gatheringLevel = player.skills?.gathering?.level || 0;
    const gatheringXP = player.skills?.gathering?.experience || 0;
    
    const canGather = Object.values(this.gatheringItems).map(item => item.name);
    const bonusMultiplier = this.calculateGatheringBonus(gatheringLevel);
    
    // Find next bonus level
    let nextBonusLevel: number | null = null;
    for (let level = gatheringLevel + 1; level <= 30; level++) {
      const currentBonus = this.calculateGatheringBonus(level);
      const previousBonus = this.calculateGatheringBonus(level - 1);
      if (Math.floor(currentBonus * 100) !== Math.floor(previousBonus * 100)) {
        nextBonusLevel = level;
        break;
      }
    }
    
    return {
      level: gatheringLevel,
      experience: gatheringXP,
      canGather,
      bonusMultiplier,
      nextBonusLevel
    };
  }

  /**
   * Get all gathering items
   */
  getAllGatheringItems(): GatheringItem[] {
    return Object.values(this.gatheringItems);
  }

  /**
   * Get gathering item by ID
   */
  getGatheringItem(itemId: string): GatheringItem | null {
    return this.gatheringItems[itemId] || null;
  }

  /**
   * Clean up expired cooldowns (call periodically)
   */
  cleanupExpiredCooldowns(): void {
    const now = Date.now();
    for (const [nodeId, cooldownEnd] of this.nodeCooldowns.entries()) {
      if (now >= cooldownEnd) {
        this.nodeCooldowns.delete(nodeId);
      }
    }
  }
}
