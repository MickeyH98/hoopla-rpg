/**
 * Experience Service
 * 
 * Handles player experience, leveling, and progression mechanics
 * for the RPG system.
 */

import { OL, PS } from "omegga";
import { PlayerId, RPGPlayer } from '../player/PlayerService';
import { RPGClassesService } from '../classes/RPGClassesService';

export interface Config {
  startingLevel: number;
  startingHealth: number;
  maxLevel: number;
}

/**
 * Service class for managing player experience and leveling
 */
export class ExperienceService {
  private omegga: OL;
  private store: PS<any>;
  private config: Config;
  private level30PlayerCache: Map<string, RPGPlayer> = new Map();
  private classesService?: RPGClassesService;
  private playerService?: any; // Reference to main PlayerService

  constructor(omegga: OL, store: PS<any>, config: Config, level30PlayerCache: Map<string, RPGPlayer>, classesService?: RPGClassesService, playerService?: any) {
    this.omegga = omegga;
    this.store = store;
    this.config = config;
    this.level30PlayerCache = level30PlayerCache;
    this.classesService = classesService;
    this.playerService = playerService;
  }

  /**
   * Adds experience to a player and handles leveling up
   * 
   * @param playerId - The ID of the player to add experience to
   * @param amount - The amount of experience to add
   * @param currentPlayerData - Optional current player data to avoid stale data issues
   * @returns Object containing level up status and new level
   */
  async addExperience({ id }: PlayerId, amount: number, currentPlayerData?: RPGPlayer): Promise<{ leveledUp: boolean; newLevel: number }> {
    const player = currentPlayerData || await this.getPlayerData({ id });
    const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
    
    console.log(`[Hoopla RPG] ExperienceService Debug: Player ${playerName}, CurrentPlayerData provided: ${!!currentPlayerData}, Player XP: ${player.experience}, Amount to add: ${amount}`);
    console.log(`[Hoopla RPG] ExperienceService Player Data:`, {
      level: player.level,
      experience: player.experience,
      skills: player.skills
    });
    
    
    // Ensure all required properties exist with fallbacks
    if (player.level === undefined) player.level = this.config.startingLevel;
    if (player.experience === undefined) player.experience = 0;
    if (player.health === undefined) player.health = this.config.startingHealth;
    if (player.maxHealth === undefined) player.maxHealth = this.config.startingHealth;
    
    const oldLevel = player.level;
    
    // Calculate total experience from all skills
    const totalSkillXP = (player.skills?.mining?.experience || 0) + 
                        (player.skills?.bartering?.experience || 0) + 
                        (player.skills?.fishing?.experience || 0) + 
                        (player.skills?.gathering?.experience || 0);
    
    // Set player's main experience to be the sum of all skill XP
    // The general XP (amount) is already included in the skill XP, so we don't add it again
    player.experience = totalSkillXP;
    
    // Also add class XP if player has a class
    if (this.classesService) {
      try {
        await this.classesService.addClassXP(id, amount);
      } catch (error) {
        console.error(`[Hoopla RPG] Error adding class XP:`, error);
      }
    }
    
    // Handle level 30 players (no more leveling)
    if (oldLevel === 30) {
      // Still add XP for tracking purposes, but don't change level
      player.experience += amount;
      // Use main PlayerService if available, otherwise use our own method
      if (this.playerService) {
        await this.playerService.setPlayerData({ id }, player);
      } else {
        await this.setPlayerData({ id }, player);
      }
      
      return { 
        leveledUp: false, 
        newLevel: 30 
      };
    }
    
    // This might indicate data corruption or race conditions
    if (oldLevel === 29) {
      const xpForLevel30 = this.getXPForNextLevel(29);
      if (player.experience >= xpForLevel30) {
        const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
        
        // Force them to level 30
        player.level = 30;
        player.maxHealth = 300; // Level 30 max health
        player.health = player.maxHealth; // Full heal
        
        // CRITICAL: Save the data and update cache immediately
        // Use main PlayerService if available, otherwise use our own method
        if (this.playerService) {
          await this.playerService.setPlayerData({ id }, player);
        } else {
          await this.setPlayerData({ id }, player);
        }
        
        // Force update the cache to prevent reload issues
        this.level30PlayerCache.set(id, { ...player });
        
        // Verify the save worked
        const verifyPlayer = await this.getPlayerData({ id });
        if (verifyPlayer.level !== 30) {
          verifyPlayer.level = 30;
          verifyPlayer.maxHealth = player.maxHealth;
          verifyPlayer.health = player.health;
          // Use main PlayerService if available, otherwise use our own method
          if (this.playerService) {
            await this.playerService.setPlayerData({ id }, verifyPlayer);
          } else {
            await this.setPlayerData({ id }, verifyPlayer);
          }
          this.level30PlayerCache.set(id, { ...verifyPlayer });
        }
        
        // Announce the level up
        this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level 30!</color>`);
        this.omegga.broadcast(`<color="0ff">${playerName} can now fly and leave minigames at will!</color>`);
        
        // CRITICAL: Automatically grant max level roles
        await this.grantMaxLevelRoles(playerName);
        
        return { 
          leveledUp: true, 
          newLevel: 30 
        };
      }
    }
    
    // Calculate new level using cumulative XP thresholds (same logic as other services)
    let newLevel = 0;
    let cumulativeXP = 0;
    
    // Check each level to see if we have enough cumulative XP to reach it
    for (let level = 1; level <= 30; level++) {
      cumulativeXP += this.getXPForNextLevel(level);
      console.log(`[Hoopla RPG] Player Level ${level}: Cumulative XP needed ${cumulativeXP}, Current XP ${player.experience}`);
      if (player.experience >= cumulativeXP) {
        newLevel = level;
      } else {
        break;
      }
    }
    
    // Cap at level 30
    newLevel = Math.min(newLevel, 30);
    player.level = newLevel;
    
    console.log(`[Hoopla RPG] Player Final Result: Level ${newLevel}, XP ${player.experience}, Old Level ${oldLevel}`);
    
    // Increase max health with level (only if we actually leveled up)
    if (newLevel > oldLevel) {
      player.maxHealth += 10;
      player.health = player.maxHealth; // Full heal on level up
      
      // Announce level up with special message for level 30
      if (newLevel === 30) {
        this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level ${newLevel}!</color>`);
        this.omegga.broadcast(`<color="0ff">${playerName} can now fly and leave minigames at will!</color>`);
      } else {
        this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level ${newLevel}!</color>`);
      }
      
      // CRITICAL: Automatically grant max level roles if they reached level 30
      if (newLevel === 30) {
        await this.grantMaxLevelRoles(playerName);
      }
      
      // CRITICAL: Extra save for level 30 players to prevent data loss
      // Use main PlayerService if available, otherwise use our own method
      if (this.playerService) {
        await this.playerService.setPlayerData({ id }, player);
      } else {
        await this.setPlayerData({ id }, player);
      }
      
      // Force update the cache to prevent reload issues
      this.level30PlayerCache.set(id, { ...player });
    } else if (oldLevel !== newLevel) {
      // This shouldn't happen, but just in case
    }
    
    // Use main PlayerService if available, otherwise use our own method
    if (this.playerService) {
      await this.playerService.setPlayerData({ id }, player);
    } else {
      await this.setPlayerData({ id }, player);
    }
    
    return { 
      leveledUp: newLevel > oldLevel, 
      newLevel: newLevel 
    };
  }

  /**
   * Calculates XP needed to reach the next level with doubled requirements
   * 
   * @param currentLevel - The current level of the player
   * @returns XP required to reach the next level
   */
  getXPForNextLevel(currentLevel: number): number {
    if (currentLevel >= 30) return 0; // Max level reached
    
    // More reasonable scaling: linear with increasing multiplier
    // Level 1: 100 XP, Level 2: 150 XP, Level 3: 200 XP, Level 4: 250 XP, etc.
    // This provides steady progression without extreme numbers
    const baseXP = 100; // Starting XP requirement for level 1
    const levelIncrease = 50; // Additional XP per level
    return baseXP + (currentLevel - 1) * levelIncrease;
  }

  /**
   * Calculates XP progress toward the next level with proper scaling
   * 
   * @param currentXP - Current total XP of the player
   * @param currentLevel - Current level of the player
   * @returns Object containing current XP, needed XP, and progress percentage
   */
  getXPProgress(currentXP: number, currentLevel: number): { current: number; needed: number; progress: number } {
    if (currentLevel >= 30) {
      return { current: 0, needed: 0, progress: 100 };
    }
    
    // Calculate XP required for current level
    const xpForCurrentLevel = this.getXPForNextLevel(currentLevel - 1);
    const xpForNextLevel = this.getXPForNextLevel(currentLevel);
    
    // Calculate XP in current level and progress
    const xpInCurrentLevel = currentXP - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - currentXP;
    const progress = Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
    
    return {
      current: xpInCurrentLevel,
      needed: xpForNextLevel - xpForCurrentLevel,
      progress: progress
    };
  }

  /**
   * Gets player data from storage or cache
   * 
   * @param playerId - The ID of the player to retrieve data for
   * @returns Promise resolving to the player's RPG data
   */
  private async getPlayerData({ id }: PlayerId): Promise<RPGPlayer> {
    // Check if this is a level 30 player in our cache
    if (this.level30PlayerCache.has(id)) {
      const cachedPlayer = this.level30PlayerCache.get(id)!;
      return cachedPlayer;
    }

    const player = (await this.store.get("rpg_" + id)) ?? this.getDefaultPlayer();
    
    // If this player is level 30, cache them to prevent data corruption
    if (player.level === 30) {
      this.level30PlayerCache.set(id, { ...player });
    }
    
    return player;
  }

  /**
   * Saves player data to storage
   * 
   * @param playerId - The ID of the player to save data for
   * @param data - The player data to save
   */
  private async setPlayerData({ id }: PlayerId, data: RPGPlayer): Promise<void> {
    // Ensure levels don't exceed max level
    const safeData = { ...data };
    safeData.level = Math.min(safeData.level, 30);
    
    if (safeData.skills) {
      if (safeData.skills.mining) {
        safeData.skills.mining.level = Math.min(safeData.skills.mining.level, 30);
      }
      if (safeData.skills.bartering) {
        safeData.skills.bartering.level = Math.min(safeData.skills.bartering.level, 30);
      }
      if (safeData.skills.fishing) {
        safeData.skills.fishing.level = Math.min(safeData.skills.fishing.level, 30);
      }
    }
    
    await this.store.set("rpg_" + id, safeData);
  }

  /**
   * Creates a default player object with initial values
   * 
   * @returns Default RPGPlayer object
   */
  private getDefaultPlayer(): RPGPlayer {
    // Ensure starting level doesn't exceed max level
    const safeStartingLevel = Math.min(this.config.startingLevel, 20);
    
    return { 
      level: safeStartingLevel, 
      experience: 0, 
      health: 100, 
      maxHealth: 100,
      inventory: [],
      consumables: [],
      nodesCollected: [],
      quests: {},
      skills: {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 },
        gathering: { level: 0, experience: 0 }
      },
      unlockedItems: []
    };
  }

  /**
   * Automatically grants max level roles when a player reaches level 30
   * 
   * @param playerName - The name of the player to grant roles to
   */
  private async grantMaxLevelRoles(playerName: string): Promise<void> {
    try {
      // Grant roles using chat commands (same method as backup plugin)
      this.omegga.writeln(`Chat.Command /grantRole "Flyer" "${playerName}"`);
      this.omegga.writeln(`Chat.Command /grantRole "MINIGAME LEAVER" "${playerName}"`);
      
      // Announce the role granting
      this.omegga.broadcast(`<color="0f0">${playerName} has been granted Flyer and MINIGAME LEAVER roles for reaching max level!</color>`);
      
    } catch (error) {
      // Don't throw - role granting failure shouldn't break level-up
    }
  }
}
