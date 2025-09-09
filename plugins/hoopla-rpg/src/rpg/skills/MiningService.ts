/**
 * Mining Service
 * 
 * Handles mining mechanics, ore requirements, and mining interactions
 * for the RPG system.
 */

import { OL } from "omegga";
import { PlayerId, RPGPlayer } from '../player/PlayerService';
import { InventoryService } from '../player/InventoryService';
import { ExperienceService } from '../progression/ExperienceService';
import { SkillService } from '../progression/SkillService';
import { ResourceService } from '../economy/ResourceService';
import { ProgressBarService } from '../utils/ProgressBar';
import { BrickTrigger } from '../world/NodeService';

/**
 * Service class for managing mining mechanics
 */
export class MiningService {
  private omegga: OL;
  private inventoryService: InventoryService;
  private experienceService: ExperienceService;
  private skillService: SkillService;
  private resourceService: ResourceService;
  private progressBarService: ProgressBarService;

  constructor(
    omegga: OL,
    inventoryService: InventoryService,
    experienceService: ExperienceService,
    skillService: SkillService,
    resourceService: ResourceService,
    progressBarService: ProgressBarService
  ) {
    this.omegga = omegga;
    this.inventoryService = inventoryService;
    this.experienceService = experienceService;
    this.skillService = skillService;
    this.resourceService = resourceService;
    this.progressBarService = progressBarService;
  }

  /**
   * Checks if a player can mine a specific ore type based on mining level
   * 
   * @param miningLevel - The player's mining skill level
   * @param oreType - The type of ore to check
   * @returns True if the player can mine this ore type
   */
  canMineOreType(miningLevel: number, oreType: string): boolean {
    const ore = oreType.toLowerCase();
    
    // Copper: Available at any level
    if (ore === 'copper' || ore === 'copper ore') {
      return true;
    }
    
    // Iron: Requires mining level 5
    if (ore === 'iron' || ore === 'iron ore') {
      return miningLevel >= 5;
    }
    
    // Gold: Requires mining level 10
    if (ore === 'gold' || ore === 'gold ore') {
      return miningLevel >= 10;
    }
    
    // Obsidian: Requires mining level 15
    if (ore === 'obsidian' || ore === 'obsidian ore') {
      return miningLevel >= 15;
    }
    
    // Diamond: Requires mining level 20
    if (ore === 'diamond' || ore === 'diamond ore') {
      return miningLevel >= 20;
    }
    
    // Any other ore types are allowed
    return true;
  }

  /**
   * Gets the number of clicks required to mine an ore based on skill level
   * 
   * @param miningLevel - The player's mining skill level
   * @param oreType - The type of ore to mine
   * @returns Number of clicks required, or -1 if cannot mine
   */
  getMiningClicksRequired(miningLevel: number, oreType: string): number {
    // Check if player can mine this ore type
    if (!this.canMineOreType(miningLevel, oreType)) {
      return -1; // Cannot mine this ore type
    }
    
    const ore = oreType.toLowerCase();
    
    // Define base click requirements for each ore tier (when first unlocked)
    let baseClicks = 10; // Default base clicks
    
    if (ore === 'copper') baseClicks = 8;      // Common - 8 clicks when first unlocked
    else if (ore === 'iron') baseClicks = 9;   // Uncommon - 9 clicks when first unlocked  
    else if (ore === 'gold') baseClicks = 10;  // Rare - 10 clicks when first unlocked
    else if (ore === 'obsidian') baseClicks = 11; // Epic - 11 clicks when first unlocked
    else if (ore === 'diamond') baseClicks = 12;  // Legendary - 12 clicks when first unlocked
    
    // Calculate clicks based on skill level
    // Formula: baseClicks - (miningLevel * 0.3)
    // This means: 10 clicks at level 0 → 1 click at level 30
    const clicksRequired = Math.max(1, Math.floor(baseClicks - (miningLevel * 0.3)));
    
    return clicksRequired;
  }

  /**
   * Calculates XP reward based on ore rarity and mining skill level
   * 
   * @param oreType - The type of ore mined
   * @param miningLevel - The player's mining skill level
   * @returns The XP reward amount
   */
  getMiningXPReward(oreType: string, miningLevel: number): number {
    const ore = oreType.toLowerCase();
    
    // Much higher base XP values to make leveling achievable
    let baseXP = 15; // Default base XP (increased from 5)
    
    // Mining resources
    if (ore === 'copper') baseXP = 15;     // Common
    else if (ore === 'iron') baseXP = 25;  // Uncommon
    else if (ore === 'gold') baseXP = 40;  // Rare
    else if (ore === 'obsidian') baseXP = 60; // Epic
    else if (ore === 'diamond') baseXP = 85;  // Legendary
    
    // Apply skill level scaling (higher level = less XP per action)
    const levelPenalty = Math.max(0.1, 1 - (miningLevel * 0.02));
    const finalXP = Math.floor(baseXP * levelPenalty);
    
    return finalXP;
  }

  /**
   * Handles mining node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @param player - The player data
   * @returns Object containing success status, message, and reward
   */
  async handleMiningNode(playerId: string, triggerId: string, trigger: BrickTrigger, player: RPGPlayer): Promise<{ success: boolean; message: string; reward?: any }> {
    try {
      const miningLevel = player.skills?.mining?.level || 0;
      
      // Extract ore type from trigger message (e.g., "rpg_mining_copper" -> "copper")
      let oreType = trigger.message;
      if (oreType.startsWith('rpg_mining_')) {
        oreType = oreType.replace('rpg_mining_', '');
      }
      oreType = this.inventoryService.normalizeItemName(oreType);
      
      // Get player name for logging
      const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
      
      // Check if player can mine this ore type
      if (!this.canMineOreType(miningLevel, oreType)) {
        if (oreType.toLowerCase() === 'iron') {
          const requirementMessage = `You need mining level 5 to mine iron! Your current level: ${miningLevel}`;
          this.omegga.middlePrint(playerId, requirementMessage);
          return { 
            success: false, 
            message: requirementMessage,
            reward: { type: 'mining_requirement', required: 5, current: miningLevel }
          };
        } else if (oreType.toLowerCase() === 'gold') {
          const requirementMessage = `You need mining level 10 to mine gold! Your current level: ${miningLevel}`;
          this.omegga.middlePrint(playerId, requirementMessage);
          return { 
            success: false, 
            message: requirementMessage,
            reward: { type: 'mining_requirement', required: 10, current: miningLevel }
          };
        } else if (oreType.toLowerCase() === 'obsidian') {
          const requirementMessage = `You need mining level 15 to mine obsidian! Your current level: ${miningLevel}`;
          this.omegga.middlePrint(playerId, requirementMessage);
          return { 
            success: false, 
            message: requirementMessage,
            reward: { type: 'mining_requirement', required: 15, current: miningLevel }
          };
        } else if (oreType.toLowerCase() === 'diamond') {
          const requirementMessage = `You need mining level 20 to mine diamond! Your current level: ${miningLevel}`;
          this.omegga.middlePrint(playerId, requirementMessage);
          return { 
            success: false, 
            message: requirementMessage,
            reward: { type: 'mining_requirement', required: 20, current: miningLevel }
          };
        }
      }
      
      // Check if node is on cooldown for this player (30 seconds after depletion)
      const isOnCooldown = this.isNodeOnCooldown(trigger, playerId);
      if (isOnCooldown) {
        const remainingSeconds = this.getNodeCooldownRemaining(trigger, playerId);
        const cooldownMessage = `Mining node depleted! Try again in ${remainingSeconds} seconds.`;
        this.omegga.middlePrint(playerId, cooldownMessage);
        return { 
          success: false, 
          message: cooldownMessage,
          reward: { type: 'mining_depleted' }
        };
      }
      
      // Get clicks required for this ore type
      const clicksRequired = this.getMiningClicksRequired(miningLevel, oreType);
      
      // Log mining calculation details
      const miningSpeed = this.getMiningSpeed(miningLevel, oreType);
      console.log(`[Hoopla RPG] Mining calculation for ${playerName}: Level ${miningLevel}, Ore: ${oreType}, Clicks required: ${clicksRequired}, Mining speed: ${miningSpeed}%`);
      
      // Initialize mining progress if not exists
      if (!trigger.miningProgress) {
        trigger.miningProgress = {};
      }
      
      const currentProgress = trigger.miningProgress[playerId] || 0;
      const newProgress = currentProgress + 1;
      
      // Check if mining is complete
      if (newProgress >= clicksRequired) {
        // Mining complete - give rewards
        const properItemName = this.inventoryService.getItemName(oreType);
        this.inventoryService.addToInventory(player, properItemName);
        
        // Calculate XP rewards based on ore rarity and mining skill level
        const generalXP = this.getMiningXPReward(oreType, miningLevel);
        const miningXP = this.getMiningXPReward(oreType, miningLevel);
        
        // Grant XP for mining
        const miningXpResult = await this.experienceService.addExperience({ id: playerId }, generalXP);
        
        // Grant Mining XP
        const miningSkillResult = await this.skillService.addSkillExperience({ id: playerId }, 'mining', miningXP);
        
        // Reset mining progress for this player
        trigger.miningProgress[playerId] = 0;
        
        // Set 30-second node cooldown after successful mining
        this.setNodeCooldown(trigger, playerId);
        
        // Get updated inventory to show total count
        const itemCount = this.inventoryService.countItem(player, properItemName);
        
        // New simplified message format with middlePrint - items in brackets with rarity colors
        const displayName = this.getItemDisplayName(oreType);
        const message = `Mined 1 ${displayName} (<color="ff0">x${itemCount}</color> in bag), Gained ${generalXP}XP and ${miningXP} Mining XP`;
        
        // Use middlePrint for the mining result
        this.omegga.middlePrint(playerId, message);
        
        return { 
          success: true, 
          message: message,
          reward: { 
            type: 'mining_complete', 
            item: properItemName, 
            xp: generalXP, 
            miningXP: miningXP,
            leveledUp: miningXpResult.leveledUp,
            newLevel: miningXpResult.newLevel
          }
        };
      } else {
        // Update mining progress
        trigger.miningProgress[playerId] = newProgress;
        
        const remainingClicks = clicksRequired - newProgress;
        const progressBar = this.progressBarService.createProgressBar(newProgress, clicksRequired);
        
        // Use middlePrint for progress updates
        this.omegga.middlePrint(playerId, `Mining ${oreType}... ${progressBar}`);
        
        return { 
          success: true, 
          message: `Mining ${oreType}... ${progressBar}`,
          reward: { type: 'mining_progress', progress: newProgress, required: clicksRequired, remaining: remainingClicks }
        };
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error in handleMiningNode:`, error);
      return { success: false, message: "An error occurred while mining" };
    }
  }

  /**
   * Sets node cooldown for a player
   * 
   * @param trigger - The trigger to set cooldown for
   * @param playerId - The ID of the player
   */
  private setNodeCooldown(trigger: BrickTrigger, playerId: string): void {
    if (!trigger.nodeCooldown) {
      trigger.nodeCooldown = {};
    }
    
    // Set 30-second cooldown
    trigger.nodeCooldown[playerId] = Date.now() + (30 * 1000);
  }

  /**
   * Gets mining statistics for a player
   * 
   * @param player - The player data
   * @returns Object containing mining statistics
   */
  getMiningStats(player: RPGPlayer): {
    level: number;
    experience: number;
    canMine: string[];
    cannotMine: string[];
    nextUnlock: string | null;
  } {
    const miningLevel = player.skills?.mining?.level || 0;
    const miningXP = player.skills?.mining?.experience || 0;
    
    const allOres = ['copper', 'iron', 'gold', 'obsidian', 'diamond'];
    const canMine: string[] = [];
    const cannotMine: string[] = [];
    let nextUnlock: string | null = null;
    
    for (const ore of allOres) {
      if (this.canMineOreType(miningLevel, ore)) {
        canMine.push(ore);
      } else {
        cannotMine.push(ore);
        if (!nextUnlock) {
          nextUnlock = ore;
        }
      }
    }
    
    return {
      level: miningLevel,
      experience: miningXP,
      canMine,
      cannotMine,
      nextUnlock
    };
  }

  /**
   * Get proper item name with rarity color (matches original format)
   */
  private getItemDisplayName(itemType: string): string {
    const item = itemType.toLowerCase();
    
    // Map ore types to proper display names with rarity colors
    // Handle both short names (gold) and full names (gold ore)
    if (item === 'copper' || item === 'copper ore') {
      return '<color="fff">[Copper Ore]</color>'; // White - Common
    } else if (item === 'iron' || item === 'iron ore') {
      return '<color="0f0">[Iron Ore]</color>'; // Green - Uncommon
    } else if (item === 'gold' || item === 'gold ore') {
      return '<color="08f">[Gold Ore]</color>'; // Blue - Rare
    } else if (item === 'obsidian' || item === 'obsidian ore') {
      return '<color="80f">[Obsidian Ore]</color>'; // Purple - Epic
    } else if (item === 'diamond' || item === 'diamond ore') {
      return '<color="f80">[Diamond Ore]</color>'; // Orange - Legendary
    } else {
      return `<color="fff">[${itemType}]</color>`; // Default white
    }
  }

  /**
   * Calculate mining speed based on mining level and ore type
   * 
   * @param miningLevel - The player's mining skill level
   * @param oreType - The type of ore being mined
   * @returns Mining speed as a percentage
   */
  private getMiningSpeed(miningLevel: number, oreType: string): number {
    const ore = oreType.toLowerCase();
    
    // Base mining speeds by ore rarity (higher = faster mining)
    let baseSpeed = 50; // Default 50%
    
    if (ore === 'copper') baseSpeed = 60;      // Common - 60% base speed
    else if (ore === 'iron') baseSpeed = 50;   // Uncommon - 50% base speed  
    else if (ore === 'gold') baseSpeed = 40;   // Rare - 40% base speed
    else if (ore === 'obsidian') baseSpeed = 30; // Epic - 30% base speed
    else if (ore === 'diamond') baseSpeed = 20;  // Legendary - 20% base speed
    
    // Increase mining speed based on mining level (up to +50% at max level)
    const levelBonus = Math.min(50, miningLevel * 1.7);
    const finalSpeed = Math.min(100, baseSpeed + levelBonus);
    
    return Math.round(finalSpeed);
  }

  /**
   * Check if a node is on cooldown for a specific player (30 seconds after depletion)
   */
  private isNodeOnCooldown(trigger: BrickTrigger, playerId: string): boolean {
    if (!trigger.nodeCooldown || !trigger.nodeCooldown[playerId]) {
      return false; // No cooldown set
    }
    
    const cooldownEndTime = trigger.nodeCooldown[playerId];
    const currentTime = Date.now();
    
    return currentTime < cooldownEndTime;
  }

  /**
   * Get remaining cooldown time in seconds
   */
  private getNodeCooldownRemaining(trigger: BrickTrigger, playerId: string): number {
    if (!trigger.nodeCooldown || !trigger.nodeCooldown[playerId]) {
      return 0; // No cooldown
    }
    
    const cooldownEndTime = trigger.nodeCooldown[playerId];
    const currentTime = Date.now();
    const remainingMs = cooldownEndTime - currentTime;
    
    return Math.max(0, Math.ceil(remainingMs / 1000)); // Convert to seconds
  }
}
