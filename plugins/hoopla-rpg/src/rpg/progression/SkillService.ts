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

export type SkillType = 'mining' | 'bartering' | 'fishing' | 'gathering' | 'combat';

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
   * @param currentPlayerData - Optional current player data to use instead of fetching from storage
   * @returns Object containing level up status, new level, current XP, and XP needed for next level
   */
  async addSkillExperience({ id }: PlayerId, skillType: SkillType, amount: number, currentPlayerData?: RPGPlayer): Promise<{ leveledUp: boolean; newLevel: number; currentXP: number; xpForNextLevel: number }> {
    const player = currentPlayerData || await this.getPlayerData({ id });
    
    // Ensure skills exist with fallbacks
    if (!player.skills) {
      player.skills = {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 },
        gathering: { level: 0, experience: 0 }
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
    
    // Skill leveling: use reasonable linear scaling system
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 30) return 0;
      
      // More reasonable scaling: linear with increasing multiplier
      // Level 1: 100 XP, Level 2: 150 XP, Level 3: 200 XP, Level 4: 250 XP, etc.
      // This provides steady progression without extreme numbers
      const baseXP = 100; // Starting XP requirement for level 1
      const levelIncrease = 50; // Additional XP per level
      return baseXP + (skillLevel - 1) * levelIncrease;
    };
    
    // Calculate new level based on cumulative XP thresholds
    let newLevel = 0;
    let cumulativeXP = 0;
    
    // Check each level to see if we have enough cumulative XP to reach it
    for (let level = 1; level <= 30; level++) {
      cumulativeXP += getSkillXPForNextLevel(level);
      console.log(`[Hoopla RPG] ${skillType} Level ${level}: Cumulative XP needed ${cumulativeXP}, Current XP ${skill.experience}`);
      if (skill.experience >= cumulativeXP) {
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
      this.omegga.broadcast(`<color="0ff">Congratulations! ${playerName} has reached ${skillType} level ${newLevel}!</color>`);
      console.log(`[Hoopla RPG] ${playerName} leveled up ${skillType} from ${oldLevel} to ${newLevel}!`);
    }
    
    await this.setPlayerData({ id }, player);
    
    // Calculate XP needed for the next level
    let cumulativeXPForCurrentLevel = 0;
    for (let level = 1; level < newLevel; level++) {
      cumulativeXPForCurrentLevel += getSkillXPForNextLevel(level);
    }
    
    let cumulativeXPForNextLevel = cumulativeXPForCurrentLevel;
    if (newLevel < 30) {
      // For level 0, we need XP for level 1, not level 0
      const targetLevel = newLevel === 0 ? 1 : newLevel;
      cumulativeXPForNextLevel += getSkillXPForNextLevel(targetLevel);
    }
    
    const xpForNextLevel = cumulativeXPForNextLevel - cumulativeXPForCurrentLevel;
    
    console.log(`[Hoopla RPG] ${skillType} Final Result: Level ${newLevel}, XP ${skill.experience}, XP for next level ${xpForNextLevel}`);
    
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
    
    // Calculate XP required for current and next level (reasonable linear scaling)
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 30) return 0;
      
      // More reasonable scaling: linear with increasing multiplier
      // Level 1: 100 XP, Level 2: 150 XP, Level 3: 200 XP, Level 4: 250 XP, etc.
      // This provides steady progression without extreme numbers
      const baseXP = 100; // Starting XP requirement for level 1
      const levelIncrease = 50; // Additional XP per level
      return baseXP + (skillLevel - 1) * levelIncrease;
    };
    
    // Calculate cumulative XP thresholds for current and next level
    let xpForCurrentLevel = 0;
    for (let level = 1; level < skill.level; level++) {
      xpForCurrentLevel += getSkillXPForNextLevel(level);
    }
    
    let xpForNextLevel = xpForCurrentLevel;
    if (skill.level < 30) {
      // For level 0, we need XP for level 1, not level 0
      const targetLevel = skill.level === 0 ? 1 : skill.level;
      xpForNextLevel += getSkillXPForNextLevel(targetLevel);
    }
    
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
      if (safeData.skills.gathering) {
        safeData.skills.gathering.level = Math.min(safeData.skills.gathering.level, 30);
      }
      if (safeData.skills.combat) {
        safeData.skills.combat.level = Math.min(safeData.skills.combat.level, 30);
      }
    }
    
    await this.store.set("rpg_" + id, safeData);
    
    // Update level 30 cache if this player is level 30
    if (safeData.level === 30) {
      this.level30PlayerCache.set(id, { ...safeData });
    }
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
      unlockedItems: [],
      quests: {},
      skills: {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 },
        gathering: { level: 0, experience: 0 },
        combat: { level: 0, experience: 0 }
      }
    };
  }
}
