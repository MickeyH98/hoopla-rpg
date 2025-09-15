/**
 * Fishing Service
 * 
 * Handles fishing mechanics, fish requirements, and fishing interactions
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
 * Service class for managing fishing mechanics
 */
export class FishingService {
  private omegga: OL;
  private inventoryService: InventoryService;
  private unifiedXPService: UnifiedXPService;
  private resourceService: ResourceService;
  private progressBarService: ProgressBarService;
  private rateLimitService: RateLimitService;
  private playerService: PlayerService;

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
   * Checks if a player can catch a specific fish type based on fishing level
   * 
   * @param fishingLevel - The player's fishing skill level
   * @param fishType - The type of fish to check
   * @returns True if the player can catch this fish type
   */
  canCatchFishType(fishingLevel: number, fishType: string): boolean {
    const fish = fishType.toLowerCase();
    
    // Common fish (available at any level)
    if (fish === 'gup' || fish === 'sardine' || fish === 'clownfish' || fish === 'icefish') return true;
    
    // Uncommon fish (requires fishing level 5)
    if ((fish === 'cod' || fish === 'tuna' || fish === 'angelfish' || fish === 'arctic char') && fishingLevel < 5) return false;
    
    // Rare fish (requires fishing level 10)
    if ((fish === 'shark' || fish === 'marlin' || fish === 'lionfish' || fish === 'beluga') && fishingLevel < 10) return false;
    
    // Epic fish (requires fishing level 15)
    if ((fish === 'whale' || fish === 'megalodon' || fish === 'manta ray' || fish === 'narwhal') && fishingLevel < 15) return false;
    
    // Legendary fish (requires fishing level 20)
    if ((fish === 'kraken' || fish === 'leviathan' || fish === 'sea dragon' || fish === 'frost kraken') && fishingLevel < 20) return false;
    
    return true;
  }

  /**
   * Gets the number of clicks required to catch a fish based on skill level
   * 
   * @param fishingLevel - The player's fishing skill level
   * @param fishType - The type of fish to catch
   * @returns Number of clicks required, or -1 if cannot catch
   */
  getFishingClicksRequired(fishingLevel: number, fishType: string): number {
    // Check if player can catch this fish type
    if (!this.canCatchFishType(fishingLevel, fishType)) {
      return -1; // Cannot catch this fish type
    }
    
    const fish = fishType.toLowerCase();
    
    // Define base click requirements for each fish tier (when first unlocked)
    let baseClicks = 10; // Default base clicks
    let unlockLevel = 0;
    
    // Common fish (available at any level)
    if (fish === 'gup' || fish === 'sardine' || fish === 'clownfish' || fish === 'icefish') {
      baseClicks = 8;
      unlockLevel = 0;
    }
    // Uncommon fish (requires fishing level 5)
    else if (fish === 'cod' || fish === 'tuna' || fish === 'angelfish' || fish === 'arctic char') {
      baseClicks = 9;
      unlockLevel = 5;
    }
    // Rare fish (requires fishing level 10)
    else if (fish === 'shark' || fish === 'marlin' || fish === 'lionfish' || fish === 'beluga') {
      baseClicks = 10;
      unlockLevel = 10;
    }
    // Epic fish (requires fishing level 15)
    else if (fish === 'whale' || fish === 'megalodon' || fish === 'manta ray' || fish === 'narwhal') {
      baseClicks = 11;
      unlockLevel = 15;
    }
    // Legendary fish (requires fishing level 20)
    else if (fish === 'kraken' || fish === 'leviathan' || fish === 'sea dragon' || fish === 'frost kraken') {
      baseClicks = 12;
      unlockLevel = 20;
    }
    
    // Calculate clicks based on skill level
    // Formula: baseClicks - ((fishingLevel - unlockLevel) * 0.3)
    // This means: baseClicks at unlock level → 1 click at max level
    const effectiveLevel = Math.max(0, fishingLevel - unlockLevel);
    const clicksRequired = Math.max(1, Math.floor(baseClicks - (effectiveLevel * 0.3)));
    
    return clicksRequired;
  }

  /**
   * Calculates XP reward based on fish rarity and fishing skill level
   * 
   * @param fishType - The type of fish caught
   * @param fishingLevel - The player's fishing skill level
   * @returns The XP reward amount
   */
  getFishingXPReward(fishType: string, fishingLevel: number): number {
    const fish = fishType.toLowerCase();
    
    // Much higher base XP values to make leveling achievable
    let baseXP = 25; // Default base XP (increased from 15)
    
    // Fishing resources
    // Freshwater fish (spot)
    if (fish === 'gup') baseXP = 25;        // Common (increased from 15)
    else if (fish === 'cod') baseXP = 40;   // Uncommon (increased from 25)
    else if (fish === 'shark') baseXP = 60; // Rare (increased from 40)
    else if (fish === 'whale') baseXP = 85; // Epic (increased from 60)
    else if (fish === 'kraken') baseXP = 120; // Legendary (increased from 85)
    
    // Deep ocean fish (spot_2)
    else if (fish === 'sardine') baseXP = 25;     // Common (increased from 15)
    else if (fish === 'tuna') baseXP = 40;        // Uncommon (increased from 25)
    else if (fish === 'marlin') baseXP = 60;      // Rare (increased from 40)
    else if (fish === 'megalodon') baseXP = 85;   // Epic (increased from 60)
    else if (fish === 'leviathan') baseXP = 120;   // Legendary (increased from 85)
    
    // Tropical fish (spot_3)
    else if (fish === 'clownfish') baseXP = 25;   // Common (increased from 15)
    else if (fish === 'angelfish') baseXP = 40;   // Uncommon (increased from 25)
    else if (fish === 'lionfish') baseXP = 60;    // Rare (increased from 40)
    else if (fish === 'manta ray') baseXP = 85;   // Epic (increased from 60)
    else if (fish === 'sea dragon') baseXP = 120;  // Legendary (increased from 85)
    
    // Arctic fish (spot_4)
    else if (fish === 'icefish') baseXP = 25;     // Common (increased from 15)
    else if (fish === 'arctic char') baseXP = 40; // Uncommon (increased from 25)
    else if (fish === 'beluga') baseXP = 60;      // Rare (increased from 40)
    else if (fish === 'narwhal') baseXP = 85;     // Epic (increased from 60)
    else if (fish === 'frost kraken') baseXP = 120; // Legendary (increased from 85)
    
    return baseXP;
  }

  /**
   * Gets a random fish type based on fishing spot and skill level
   * 
   * @param fishingSpot - The type of fishing spot
   * @param fishingLevel - The player's fishing skill level
   * @returns The fish type to catch
   */
  getRandomFishType(fishingSpot: string, fishingLevel: number): string {
    const spot = fishingSpot.toLowerCase();
    
    let availableFish: string[] = [];
    
    if (spot === 'spot') {
      // Freshwater fish
      availableFish = ['gup', 'cod', 'shark', 'whale', 'kraken'];
    } else if (spot === 'spot_2') {
      // Deep ocean fish
      availableFish = ['sardine', 'tuna', 'marlin', 'megalodon', 'leviathan'];
    } else if (spot === 'spot_3') {
      // Tropical fish
      availableFish = ['clownfish', 'angelfish', 'lionfish', 'manta ray', 'sea dragon'];
    } else if (spot === 'spot_4') {
      // Arctic fish
      availableFish = ['icefish', 'arctic char', 'beluga', 'narwhal', 'frost kraken'];
    } else {
      // Default to freshwater
      availableFish = ['gup', 'cod', 'shark', 'whale', 'kraken'];
    }
    
    // Filter fish based on skill level
    const catchableFish = availableFish.filter(fish => this.canCatchFishType(fishingLevel, fish));
    
    if (catchableFish.length === 0) {
      console.log(`[Hoopla RPG] Fish Type Debug - No catchable fish found, falling back to gup`);
      return 'gup'; // Fallback to common fish
    }
    
    // Weighted random selection (rarer fish are less likely)
    const weights = catchableFish.map(fish => {
      const rarity = this.resourceService.getResourceRarity(fish);
      return Math.max(1, 6 - rarity); // Higher weight for lower rarity
    });
    
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < catchableFish.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return catchableFish[i];
      }
    }
    
    return catchableFish[0]; // Fallback
  }

  /**
   * Handles fishing node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @param player - The player data
   * @returns Object containing success status, message, and reward
   */
  async handleFishingNode(playerId: string, triggerId: string, trigger: BrickTrigger, player: RPGPlayer): Promise<{ success: boolean; message: string; reward?: any }> {
    try {
      // Check rate limiting for fishing interactions
      const interactionKey = `fishing_${playerId}_${triggerId}`;
      if (!this.rateLimitService.canPlayerInteract(playerId, interactionKey)) {
        return { success: false, message: "Rate limit exceeded. Please slow down your fishing." };
      }

      const fishingLevel = player.skills?.fishing?.level || 0;
      
      // Get player name for logging
      const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
      
      // Initialize fishing progress if not exists
      if (!trigger.fishingProgress) {
        trigger.fishingProgress = {};
      }
      if (!trigger.fishingAttemptsRemaining) {
        trigger.fishingAttemptsRemaining = {};
      }
      
      // Get or initialize attempts remaining for this player
      let attemptsRemaining = trigger.fishingAttemptsRemaining[playerId];
      if (attemptsRemaining === undefined) {
        attemptsRemaining = 5; // Default 5 attempts per fishing spot
        trigger.fishingAttemptsRemaining[playerId] = attemptsRemaining;
      }
      
      // Check if node is on cooldown for this player (30 seconds after depletion)
      const isOnCooldown = this.isNodeOnCooldown(trigger, playerId);
      if (isOnCooldown) {
        const remainingSeconds = this.getNodeCooldownRemaining(trigger, playerId);
        const cooldownMessage = `Fishing spot depleted! Try again in ${remainingSeconds} seconds.`;
        this.omegga.middlePrint(playerId, cooldownMessage);
        return { 
          success: false, 
          message: cooldownMessage,
          reward: { type: 'fishing_depleted' }
        };
      }
      
      // If cooldown has expired, reset attempts to 5 and clear fishing target
      if (attemptsRemaining === 0) {
        attemptsRemaining = 5;
        trigger.fishingAttemptsRemaining[playerId] = attemptsRemaining;
        // Clear fishing target and progress when cooldown expires
        if (trigger.fishingTarget) {
          delete trigger.fishingTarget[playerId];
        }
        if (trigger.fishingProgress) {
          delete trigger.fishingProgress[playerId];
        }
      }
      
      // If not on cooldown and attempts are undefined, reset to 5
      // Only reset if we're not on cooldown (cooldown means attempts were depleted)
      if (attemptsRemaining === undefined && !isOnCooldown) {
        attemptsRemaining = 5;
        trigger.fishingAttemptsRemaining[playerId] = attemptsRemaining;
      }
      
      
      // Get current fishing progress
      const currentProgress = trigger.fishingProgress[playerId] || 0;
      const newProgress = currentProgress + 1;
      
      // Initialize fishing target if not exists
      if (!trigger.fishingTarget) {
        trigger.fishingTarget = {};
      }
      
      // Get or determine fish type for this player
      let fishType = trigger.fishingTarget[playerId];
      if (!fishType) {
        // First time fishing at this spot - determine fish type based on trigger ID
        // Use the trigger ID to determine the fishing spot type since it contains the original message
        const triggerId = trigger.id;
        
        if (triggerId.includes('rpg_fishing_spot_4')) {
          fishType = this.getRandomFishType('spot_4', fishingLevel);
        } else if (triggerId.includes('rpg_fishing_spot_3')) {
          fishType = this.getRandomFishType('spot_3', fishingLevel);
        } else if (triggerId.includes('rpg_fishing_spot_2')) {
          fishType = this.getRandomFishType('spot_2', fishingLevel);
        } else if (triggerId.includes('rpg_fishing_spot')) {
          fishType = this.getRandomFishType('spot', fishingLevel);
        } else {
          // Fallback to freshwater fishing
          fishType = this.getRandomFishType('spot', fishingLevel);
        }
        
        trigger.fishingTarget[playerId] = fishType;
      }
      
      // Get clicks required for this fish type
      const clicksRequired = this.getFishingClicksRequired(fishingLevel, fishType);
      
      // Log fishing calculation details
      const encounterRate = this.getEncounterRate(fishType, fishingLevel);
      const captureRate = this.getCaptureRate(fishType, fishingLevel);
      console.log(`[Hoopla RPG] ${playerName} is fishing ${fishType}`);
      
      if (clicksRequired === -1) {
        const requirementMessage = `You need higher fishing level to catch ${fishType}! Your current level: ${fishingLevel}`;
        this.omegga.middlePrint(playerId, requirementMessage);
        return { 
          success: false, 
          message: requirementMessage,
          reward: { type: 'fishing_requirement', fish: fishType, current: fishingLevel }
        };
      }
      
      // Check if fishing is complete
      if (newProgress >= clicksRequired) {
        // Fishing complete - give rewards
        const formattedFishName = this.formatFishName(fishType);
        this.inventoryService.addToInventory(player, formattedFishName);
        
        // Calculate XP rewards based on fish rarity and fishing skill level
        const xpAmount = this.getFishingXPReward(fishType, fishingLevel);
        
        // Grant XP using unified service (player XP + fishing skill XP + class XP)
        const xpResult = await this.unifiedXPService.grantXP(playerId, {
          playerXP: xpAmount,
          skillXP: xpAmount,
          skillType: 'fishing',
          grantClassXP: true
        }, player);
        
        // Decrease attempts remaining
        attemptsRemaining--;
        trigger.fishingAttemptsRemaining[playerId] = attemptsRemaining;
        
        // Reset fishing progress and target for this player
        trigger.fishingProgress[playerId] = 0;
        if (trigger.fishingTarget) {
          delete trigger.fishingTarget[playerId];
        }
        
        // Check if this was the last attempt
        if (attemptsRemaining <= 0) {
          // Node is depleted - set 30-second cooldown
          this.setNodeCooldown(trigger, playerId);
          
          // Set attempts to 0 instead of deleting (so cooldown logic can work)
          trigger.fishingAttemptsRemaining[playerId] = 0;
          
          // Get updated inventory to show total count
          const fishCount = this.inventoryService.countItem(player, formattedFishName);
          
          // Combined message for final attempt: fish result + depletion notice
          const fishColor = this.resourceService.getResourceColor(fishType);
          
          // Get fishing skill progress for display
          const xpProgress = await this.unifiedXPService.getXPProgress(playerId, 'fishing');
          const fishingProgress = xpProgress.skill;
          
          let fishingMessage = `Caught 1 <color="${fishColor}">[${formattedFishName}]</color> (<color="ff0">x${fishCount}</color> in bag), Gained ${xpAmount}XP and ${xpAmount} Fishing XP - Fishing spot depleted! Come back in 30 seconds.`;
          
          if (fishingProgress) {
            const maxLevelText = fishingProgress.level >= 30 ? " (MAX)" : "";
            fishingMessage += ` - Fishing ${fishingProgress.level}${maxLevelText} | ${fishingProgress.xp}/${fishingProgress.xpForNextLevel}XP (${Math.round(fishingProgress.progress)}%)`;
          }
          
          // Use middlePrint for the combined result
          this.omegga.middlePrint(playerId, fishingMessage);
          
          // Note: Player data is already saved by the XP services
          
          // Announce legendary fish catches to the server
          if (this.resourceService.isLegendaryResource(fishType)) {
            const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
            this.omegga.broadcast(`<color="fff">LEGENDARY CATCH! ${playerName} has caught a <color="${fishColor}">[${formattedFishName}]</color>!</color>`);
          }
          
          return { 
            success: true, 
            message: fishingMessage,
            reward: { 
              type: 'fishing_complete_depleted', 
              fish: fishType, 
              xp: xpAmount, 
              fishingXP: xpAmount,
              leveledUp: xpResult.playerLeveledUp || xpResult.skillLeveledUp,
              newLevel: xpResult.newPlayerLevel
            }
          };
        } else {
          // Regular fishing result (not the final attempt)
          const fishCount = this.inventoryService.countItem(player, formattedFishName);
          
          const fishColor = this.resourceService.getResourceColor(fishType);
          
          // Get fishing skill progress for display
          const xpProgress = await this.unifiedXPService.getXPProgress(playerId, 'fishing');
          const fishingProgress = xpProgress.skill;
          
          let fishingMessage = `Caught 1 <color="${fishColor}">[${formattedFishName}]</color> (<color="ff0">x${fishCount}</color> in bag), Gained ${xpAmount}XP and ${xpAmount} Fishing XP - ${attemptsRemaining} attempts remaining`;
          
          if (fishingProgress) {
            const maxLevelText = fishingProgress.level >= 30 ? " (MAX)" : "";
            fishingMessage += ` - Fishing ${fishingProgress.level}${maxLevelText} | ${fishingProgress.xp}/${fishingProgress.xpForNextLevel}XP (${Math.round(fishingProgress.progress)}%)`;
          }
          
          // Use middlePrint for the regular result
          this.omegga.middlePrint(playerId, fishingMessage);
          
          // Note: Player data is already saved by the XP services
          
          // Announce legendary fish catches to the server
          if (this.resourceService.isLegendaryResource(fishType)) {
            const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
            this.omegga.broadcast(`<color="fff">LEGENDARY CATCH! ${playerName} has caught a <color="${fishColor}">[${formattedFishName}]</color>!</color>`);
          }
          
          return { 
            success: true, 
            message: fishingMessage,
            reward: { 
              type: 'fishing_complete', 
              fish: fishType, 
              xp: xpAmount, 
              fishingXP: xpAmount,
              leveledUp: xpResult.playerLeveledUp || xpResult.skillLeveledUp,
              newLevel: xpResult.newPlayerLevel,
              attemptsRemaining
            }
          };
        }
      } else {
        // Update fishing progress
        trigger.fishingProgress[playerId] = newProgress;
        
        const remainingClicks = clicksRequired - newProgress;
        const progressBar = this.progressBarService.createProgressBar(newProgress, clicksRequired);
        
        // Use middlePrint for progress updates
        this.omegga.middlePrint(playerId, `Fishing... ${progressBar} - ${attemptsRemaining} attempts remaining`);
        
        return { 
          success: true, 
          message: `Fishing... ${progressBar} - ${attemptsRemaining} attempts remaining`,
          reward: { type: 'fishing_progress', progress: newProgress, required: clicksRequired, remaining: remainingClicks, attemptsRemaining }
        };
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error in handleFishingNode:`, error);
      return { success: false, message: "An error occurred while fishing" };
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
   * Formats a fish name with proper capitalization
   * 
   * @param fishType - The fish type to format
   * @returns Properly capitalized fish name
   */
  private formatFishName(fishType: string): string {
    return fishType
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Gets fishing statistics for a player
   * 
   * @param player - The player data
   * @returns Object containing fishing statistics
   */
  getFishingStats(player: RPGPlayer): {
    level: number;
    experience: number;
    canCatch: string[];
    cannotCatch: string[];
    nextUnlock: string | null;
  } {
    const fishingLevel = player.skills?.fishing?.level || 0;
    const fishingXP = player.skills?.fishing?.experience || 0;
    
    const allFish = ['gup', 'cod', 'shark', 'whale', 'kraken', 'sardine', 'tuna', 'marlin', 'megalodon', 'leviathan', 
                     'clownfish', 'angelfish', 'lionfish', 'manta ray', 'sea dragon', 'icefish', 'arctic char', 
                     'beluga', 'narwhal', 'frost kraken'];
    const canCatch: string[] = [];
    const cannotCatch: string[] = [];
    let nextUnlock: string | null = null;
    
    for (const fish of allFish) {
      if (this.canCatchFishType(fishingLevel, fish)) {
        canCatch.push(fish);
      } else {
        cannotCatch.push(fish);
        if (!nextUnlock) {
          nextUnlock = fish;
        }
      }
    }
    
    return {
      level: fishingLevel,
      experience: fishingXP,
      canCatch,
      cannotCatch,
      nextUnlock
    };
  }

  /**
   * Calculate encounter rate for a fish type based on fishing level
   * 
   * @param fishType - The type of fish
   * @param fishingLevel - The player's fishing skill level
   * @returns Encounter rate as a percentage
   */
  private getEncounterRate(fishType: string, fishingLevel: number): number {
    const fish = fishType.toLowerCase();
    
    // Base encounter rates by fish rarity
    let baseRate = 50; // Default 50%
    
    // Common fish (available at any level)
    if (fish === 'gup' || fish === 'sardine' || fish === 'clownfish' || fish === 'icefish') {
      baseRate = 60;
    }
    // Uncommon fish (requires fishing level 5)
    else if (fish === 'cod' || fish === 'tuna' || fish === 'angelfish' || fish === 'arctic char') {
      baseRate = 40;
    }
    // Rare fish (requires fishing level 10)
    else if (fish === 'shark' || fish === 'marlin' || fish === 'lionfish' || fish === 'beluga') {
      baseRate = 25;
    }
    // Epic fish (requires fishing level 15)
    else if (fish === 'whale' || fish === 'megalodon' || fish === 'manta ray' || fish === 'narwhal') {
      baseRate = 15;
    }
    // Legendary fish (requires fishing level 20)
    else if (fish === 'kraken' || fish === 'leviathan' || fish === 'sea dragon' || fish === 'frost kraken') {
      baseRate = 5;
    }
    
    // Increase encounter rate based on fishing level (up to +20% at max level)
    const levelBonus = Math.min(20, fishingLevel * 0.7);
    const finalRate = Math.min(100, baseRate + levelBonus);
    
    return Math.round(finalRate);
  }

  /**
   * Calculate capture rate for a fish type based on fishing level
   * 
   * @param fishType - The type of fish
   * @param fishingLevel - The player's fishing skill level
   * @returns Capture rate as a percentage
   */
  private getCaptureRate(fishType: string, fishingLevel: number): number {
    const fish = fishType.toLowerCase();
    
    // Base capture rates by fish rarity
    let baseRate = 80; // Default 80%
    
    // Common fish (available at any level)
    if (fish === 'gup' || fish === 'sardine' || fish === 'clownfish' || fish === 'icefish') {
      baseRate = 90;
    }
    // Uncommon fish (requires fishing level 5)
    else if (fish === 'cod' || fish === 'tuna' || fish === 'angelfish' || fish === 'arctic char') {
      baseRate = 85;
    }
    // Rare fish (requires fishing level 10)
    else if (fish === 'shark' || fish === 'marlin' || fish === 'lionfish' || fish === 'beluga') {
      baseRate = 75;
    }
    // Epic fish (requires fishing level 15)
    else if (fish === 'whale' || fish === 'megalodon' || fish === 'manta ray' || fish === 'narwhal') {
      baseRate = 65;
    }
    // Legendary fish (requires fishing level 20)
    else if (fish === 'kraken' || fish === 'leviathan' || fish === 'sea dragon' || fish === 'frost kraken') {
      baseRate = 50;
    }
    
    // Increase capture rate based on fishing level (up to +25% at max level)
    const levelBonus = Math.min(25, fishingLevel * 0.8);
    const finalRate = Math.min(100, baseRate + levelBonus);
    
    return Math.round(finalRate);
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
