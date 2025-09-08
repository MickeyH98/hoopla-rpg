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
      
      // Single clean log per brick interaction
      console.log(`[Hoopla RPG] ${playerName} mining ${oreType} (level ${miningLevel})`);
      
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
      
      // Initialize mining progress if not exists
      if (!trigger.miningProgress) {
        trigger.miningProgress = {};
      }
      
      const currentProgress = trigger.miningProgress[playerId] || 0;
      const newProgress = currentProgress + 1;
      
      console.log(`[DEBUG] Mining progress: ${currentProgress} -> ${newProgress} (required: ${clicksRequired})`);
      
      // Check if mining is complete
      if (newProgress >= clicksRequired) {
        console.log(`[DEBUG] Mining completed for ${playerName}!`);
        // Mining complete - give rewards
        const properItemName = this.inventoryService.getItemName(oreType);
        console.log(`[DEBUG] Adding ${properItemName} to inventory`);
        this.inventoryService.addToInventory(player, properItemName);
        
        // Calculate XP rewards based on ore rarity and mining skill level
        const generalXP = this.getMiningXPReward(oreType, miningLevel);
        const miningXP = this.getMiningXPReward(oreType, miningLevel);
        console.log(`[DEBUG] XP rewards: ${generalXP} general XP, ${miningXP} mining XP`);
        
        // Grant XP for mining
        console.log(`[DEBUG] Granting general XP...`);
        const miningXpResult = await this.experienceService.addExperience({ id: playerId }, generalXP);
        console.log(`[DEBUG] General XP result:`, miningXpResult);
        
        // Grant Mining XP
        console.log(`[DEBUG] Granting mining skill XP...`);
        const miningSkillResult = await this.skillService.addSkillExperience({ id: playerId }, 'mining', miningXP);
        console.log(`[DEBUG] Mining skill XP result:`, miningSkillResult);
        
        // Reset mining progress for this player
        trigger.miningProgress[playerId] = 0;
        
        // Set 30-second node cooldown after successful mining
        this.setNodeCooldown(trigger, playerId);
        
        // Get updated inventory to show total count
        const itemCount = this.inventoryService.countItem(player, properItemName);
        console.log(`[DEBUG] Item count in inventory: ${itemCount}`);
        
        // New simplified message format with middlePrint - items in brackets with rarity colors
        const displayName = this.getItemDisplayName(oreType);
        const message = `Mined 1 ${displayName} (<color="ff0">x${itemCount}</color> in bag), Gained ${generalXP}XP and ${miningXP} Mining XP`;
        console.log(`[DEBUG] Final mining message: ${message}`);
        
        // Use middlePrint for the mining result
        this.omegga.middlePrint(playerId, message);
        console.log(`[DEBUG] Mining completion successful!`);
        
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
        
        console.log(`[DEBUG] Mining progress update: ${newProgress}/${clicksRequired} (${remainingClicks} remaining)`);
        
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
    switch (item) {
      case 'copper':
        return '<color="fff">Copper Ore</color>'; // White - Common
      case 'iron':
        return '<color="0f0">Iron Ore</color>'; // Green - Uncommon
      case 'gold':
        return '<color="08f">Gold Ore</color>'; // Blue - Rare
      case 'obsidian':
        return '<color="80f">Obsidian Ore</color>'; // Purple - Epic
      case 'diamond':
        return '<color="f80">Diamond Ore</color>'; // Orange - Legendary
      default:
        return `<color="fff">${itemType}</color>`; // Default white
    }
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
