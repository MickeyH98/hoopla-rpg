/**
 * Skill Service
 * 
 * Handles skill experience, leveling, and progression mechanics
 * for mining, bartering, and fishing skills in the RPG system.
 */

import { OL, PS } from "omegga";
import { PlayerId, RPGPlayer } from '../player/PlayerService';

export interface Config {
  startingLevel: number;
  startingHealth: number;
  maxLevel: number;
}

export type SkillType = 'mining' | 'bartering' | 'fishing';

/**
 * Service class for managing player skills and skill progression
 */
export class SkillService {
  private omegga: OL;
  private store: PS<any>;
  private config: Config;
  private level30PlayerCache: Map<string, RPGPlayer> = new Map();

  constructor(omegga: OL, store: PS<any>, config: Config, level30PlayerCache: Map<string, RPGPlayer>) {
    this.omegga = omegga;
    this.store = store;
    this.config = config;
    this.level30PlayerCache = level30PlayerCache;
  }

  /**
   * Adds skill experience and checks for level up
   * 
   * @param playerId - The ID of the player to add skill experience to
   * @param skillType - The type of skill to add experience to
   * @param amount - The amount of experience to add
   * @returns Object containing level up status, new level, current XP, and XP needed for next level
   */
  async addSkillExperience({ id }: PlayerId, skillType: SkillType, amount: number): Promise<{ leveledUp: boolean; newLevel: number; currentXP: number; xpForNextLevel: number }> {
    const player = await this.getPlayerData({ id });
    
    // Ensure skills exist with fallbacks
    if (!player.skills) {
      player.skills = {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      };
    }
    
    // Ensure the specific skill exists
    if (!player.skills[skillType]) {
      player.skills[skillType] = { level: 0, experience: 0 };
    }
    
    const skill = player.skills[skillType];
    const oldLevel = skill.level;
    
    // Add experience
    skill.experience += amount;
    
    // Skill leveling: challenging progressive scaling
    // Each level requires significantly more XP than the previous
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 30) return 0;
      
      // Progressive scaling that gets much harder at higher levels
      // Level 1: 100 XP, Level 2: 150 XP, Level 3: 225 XP, Level 4: 325 XP, etc.
      // Each level requires more XP than the previous, with increasing difficulty
      const baseXP = 100;
      const levelIncrease = 50; // Base increase
      
      // Calculate XP needed for the current level
      let xpForCurrentLevel = baseXP;
      for (let level = 1; level < skillLevel; level++) {
        xpForCurrentLevel += levelIncrease + (level * 25); // Increasing difficulty (matches old system)
      }
      
      return xpForCurrentLevel;
    };
    
    // Calculate new level based on total XP
    let newLevel = 0;
    for (let level = 1; level <= 30; level++) {
      if (skill.experience >= getSkillXPForNextLevel(level)) {
        newLevel = level;
      } else {
        break;
      }
    }
    
    // Additional safety check: cap at level 30
    newLevel = Math.min(newLevel, 30);
    skill.level = newLevel;
    
    const leveledUp = newLevel > oldLevel;
    
    // Announce skill level up
    if (leveledUp) {
      const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
      this.omegga.broadcast(`<color="0f0">${playerName} reached ${skillType} level ${newLevel}!</color>`);
    }
    
    await this.setPlayerData({ id }, player);
    
    const xpForNextLevel = getSkillXPForNextLevel(newLevel);
    
    return { 
      leveledUp, 
      newLevel, 
      currentXP: skill.experience,
      xpForNextLevel
    };
  }

  /**
   * Gets skill level and XP progress with proper scaling
   * 
   * @param playerId - The ID of the player to get skill progress for
   * @param skillType - The type of skill to get progress for
   * @returns Object containing level, experience, XP needed for next level, and progress percentage
   */
  async getSkillProgress({ id }: PlayerId, skillType: SkillType): Promise<{ level: number; experience: number; xpForNextLevel: number; progress: number }> {
    const player = await this.getPlayerData({ id });
    
    if (!player.skills || !player.skills[skillType]) {
      return { level: 0, experience: 0, xpForNextLevel: 100, progress: 0 };
    }
    
    const skill = player.skills[skillType];
    
    // Calculate XP required for current and next level
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 30) return 0;
      
      // Progressive scaling that gets much harder at higher levels
      // Level 1: 100 XP, Level 2: 150 XP, Level 3: 225 XP, Level 4: 325 XP, etc.
      // Each level requires more XP than the previous, with increasing difficulty
      const baseXP = 100;
      const levelIncrease = 50; // Base increase
      
      // Calculate XP needed for the current level
      let xpForCurrentLevel = baseXP;
      for (let level = 1; level < skillLevel; level++) {
        xpForCurrentLevel += levelIncrease + (level * 25); // Increasing difficulty (matches old system)
      }
      
      return xpForCurrentLevel;
    };
    
    // Calculate XP thresholds for current and next level
    const xpForCurrentLevel = skill.level === 0 ? 0 : getSkillXPForNextLevel(skill.level);
    const xpForNextLevel = getSkillXPForNextLevel(skill.level + 1);
    
    // Calculate progress within current level
    const xpInCurrentLevel = skill.experience - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
    const progress = xpNeededForNextLevel > 0 ? Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100)) : 0;
    
    // Debug: Log the XP calculations to see what's happening
    console.log(`[Hoopla RPG] ${skillType} Level ${skill.level}: Current XP ${skill.experience}, XP for current level ${xpForCurrentLevel}, XP for next level ${xpForNextLevel}, XP needed ${xpNeededForNextLevel}`);
    
    return {
      level: skill.level,
      experience: skill.experience,
      xpForNextLevel: xpForNextLevel - xpForCurrentLevel,
      progress: progress
    };
  }

  /**
   * Calculates XP needed for the next skill level
   * 
   * @param skillLevel - The current skill level
   * @returns XP required to reach the next level
   */
  getSkillXPForNextLevel(skillLevel: number): number {
    if (skillLevel >= 30) return 0;
    
    // Progressive scaling that gets much harder at higher levels
    const baseXP = 100;
    const levelIncrease = 50; // Base increase
    
    // Calculate XP needed for the current level
    let xpForCurrentLevel = baseXP;
    for (let level = 1; level < skillLevel; level++) {
      xpForCurrentLevel += baseXP + (level * levelIncrease);
    }
    
    return xpForCurrentLevel;
  }

  /**
   * Gets the current level of a specific skill for a player
   * 
   * @param playerId - The ID of the player to get skill level for
   * @param skillType - The type of skill to get level for
   * @returns The current level of the skill
   */
  async getSkillLevel({ id }: PlayerId, skillType: SkillType): Promise<number> {
    const player = await this.getPlayerData({ id });
    
    if (!player.skills || !player.skills[skillType]) {
      return 0;
    }
    
    return player.skills[skillType].level;
  }

  /**
   * Gets the current experience of a specific skill for a player
   * 
   * @param playerId - The ID of the player to get skill experience for
   * @param skillType - The type of skill to get experience for
   * @returns The current experience of the skill
   */
  async getSkillExperience({ id }: PlayerId, skillType: SkillType): Promise<number> {
    const player = await this.getPlayerData({ id });
    
    if (!player.skills || !player.skills[skillType]) {
      return 0;
    }
    
    return player.skills[skillType].experience;
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
        fishing: { level: 0, experience: 0 }
      }
    };
  }
}
