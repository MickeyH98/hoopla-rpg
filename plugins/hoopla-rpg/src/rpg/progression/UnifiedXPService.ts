/**
 * Unified XP Service
 * 
 * Centralized service for managing all XP-related operations including:
 * - Player XP (general/overall level)
 * - Skill XP (mining, fishing, gathering, bartering)
 * - Class XP (current active class)
 * 
 * This service ensures consistent XP granting and level-up logic across all systems.
 */

import { OL } from "omegga";
import { PlayerId, RPGPlayer, PlayerService } from '../player/PlayerService';
import { SkillType } from './SkillService';
import { RPGClassesService } from '../classes/RPGClassesService';
import { PS } from "omegga";

/**
 * XP Requirements Configuration
 * 
 * This is the single source of truth for all XP requirements in the system.
 * All XP calculations should reference this table to ensure consistency.
 * 
 * Format: [level]: cumulative XP required to reach that level
 * Level 0 = 0 XP (starting level)
 * Level 1 = 100 XP total
 * Level 2 = 250 XP total (100 + 150)
 * Level 3 = 450 XP total (100 + 150 + 200)
 * etc.
 */
export const XP_REQUIREMENTS: Record<number, number> = {
  0: 0,      // Starting level
  1: 100,    // 100 XP total to reach level 1
  2: 250,    // 250 XP total to reach level 2 (100 + 150)
  3: 450,    // 450 XP total to reach level 3 (100 + 150 + 200)
  4: 700,    // 700 XP total to reach level 4 (100 + 150 + 200 + 250)
  5: 1000,   // 1000 XP total to reach level 5 (100 + 150 + 200 + 250 + 300)
  6: 1350,   // 1350 XP total to reach level 6 (100 + 150 + 200 + 250 + 300 + 350)
  7: 1750,   // 1750 XP total to reach level 7 (100 + 150 + 200 + 250 + 300 + 350 + 400)
  8: 2200,   // 2200 XP total to reach level 8 (100 + 150 + 200 + 250 + 300 + 350 + 400 + 450)
  9: 2700,   // 2700 XP total to reach level 9 (100 + 150 + 200 + 250 + 300 + 350 + 400 + 450 + 500)
  10: 3250,  // 3250 XP total to reach level 10 (100 + 150 + 200 + 250 + 300 + 350 + 400 + 450 + 500 + 550)
  11: 3850,  // 3850 XP total to reach level 11
  12: 4500,  // 4500 XP total to reach level 12
  13: 5200,  // 5200 XP total to reach level 13
  14: 5950,  // 5950 XP total to reach level 14
  15: 6750,  // 6750 XP total to reach level 15
  16: 7600,  // 7600 XP total to reach level 16
  17: 8500,  // 8500 XP total to reach level 17
  18: 9450,  // 9450 XP total to reach level 18
  19: 10450, // 10450 XP total to reach level 19
  20: 11500, // 11500 XP total to reach level 20
  21: 12600, // 12600 XP total to reach level 21
  22: 13750, // 13750 XP total to reach level 22
  23: 14950, // 14950 XP total to reach level 23
  24: 16200, // 16200 XP total to reach level 24
  25: 17500, // 17500 XP total to reach level 25
  26: 18850, // 18850 XP total to reach level 26
  27: 20250, // 20250 XP total to reach level 27
  28: 21700, // 21700 XP total to reach level 28
  29: 23200, // 23200 XP total to reach level 29
  30: 24750  // 24750 XP total to reach level 30 (max level)
};

/**
 * Maximum level in the system
 */
export const MAX_LEVEL = 30;

/**
 * Result of XP granting operation
 */
export interface XPGrantResult {
  playerLeveledUp: boolean;
  skillLeveledUp: boolean;
  classLeveledUp: boolean;
  newPlayerLevel: number;
  newSkillLevel: number;
  newClassLevel: number;
  playerXP: number;
  skillXP: number;
  classXP: number;
}

/**
 * Configuration for XP granting
 */
export interface XPGrantConfig {
  playerXP: number;
  skillXP?: number;
  skillType?: SkillType;
  classXP?: number;
  grantClassXP?: boolean;
}

/**
 * Unified XP Service class
 */
export class UnifiedXPService {
  private omegga: OL;
  private store: PS<any>;
  private playerService: PlayerService;
  private classesService?: RPGClassesService;

  constructor(
    omegga: OL,
    store: PS<any>,
    playerService: PlayerService,
    classesService?: RPGClassesService
  ) {
    this.omegga = omegga;
    this.store = store;
    this.playerService = playerService;
    this.classesService = classesService;
  }

  /**
   * Grants XP to player, skill, and class systems
   * 
   * @param playerId - The ID of the player to grant XP to
   * @param config - XP granting configuration
   * @param currentPlayerData - Optional current player data to avoid stale data issues
   * @returns Result of XP granting operation
   */
  async grantXP(
    playerId: string,
    config: XPGrantConfig,
    currentPlayerData?: RPGPlayer
  ): Promise<XPGrantResult> {
    const player = currentPlayerData || await this.playerService.getPlayerData({ id: playerId });
    const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
    
    // Ensure all required properties exist with fallbacks
    if (player.level === undefined) player.level = 0;
    if (player.experience === undefined) player.experience = 0;
    if (player.health === undefined) player.health = 100;
    if (player.maxHealth === undefined) player.maxHealth = 100;
    
    // Ensure skills exist with fallbacks
    if (!player.skills) {
      player.skills = {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 },
        gathering: { level: 0, experience: 0 },
        combat: { level: 0, experience: 0 }
      };
    }
    
    const oldPlayerLevel = player.level;
    const oldSkillLevel = config.skillType ? (player.skills[config.skillType]?.level || 0) : 0;
    
    // 1. Grant Player XP
    player.experience += config.playerXP;
    const newPlayerLevel = this.calculateLevelFromXP(player.experience);
    const playerLeveledUp = newPlayerLevel > oldPlayerLevel;
    player.level = newPlayerLevel;
    
    // 2. Grant Skill XP (if specified)
    let skillLeveledUp = false;
    let newSkillLevel = oldSkillLevel;
    let skillXP = 0;
    
    if (config.skillType && config.skillXP && config.skillXP > 0) {
      // Ensure the specific skill exists
      if (!player.skills[config.skillType]) {
        player.skills[config.skillType] = { level: 0, experience: 0 };
      }
      
      const skill = player.skills[config.skillType];
      const oldSkillLevelForType = skill.level;
      
      // Add skill experience
      skill.experience += config.skillXP;
      skillXP = skill.experience;
      
      // Calculate new skill level
      newSkillLevel = this.calculateLevelFromXP(skill.experience);
      skillLeveledUp = newSkillLevel > oldSkillLevelForType;
      skill.level = newSkillLevel;
      
      console.log(`[Hoopla RPG] ${config.skillType} skill: ${oldSkillLevelForType} -> ${newSkillLevel} (${skill.experience} XP)`);
    }
    
    // 3. Grant Class XP (if enabled and class service available)
    let classLeveledUp = false;
    let newClassLevel = 0;
    let classXP = 0;
    
    if (config.grantClassXP && this.classesService && (config.classXP || config.playerXP > 0)) {
      const classXPAmount = config.classXP || config.playerXP;
      const classResult = await this.classesService.addClassXP(playerId, classXPAmount);
      classLeveledUp = classResult.leveledUp;
      newClassLevel = classResult.newLevel;
      
      // Get current class XP for return value
      const classData = await this.classesService.getPlayerClassLevel(playerId);
      classXP = classData?.xp || 0;
      
      console.log(`[Hoopla RPG] Class XP: ${classResult.newLevel} (${classXP} XP)`);
    }
    
    // 4. Handle level-up bonuses for player level
    if (playerLeveledUp) {
      // Increase max health with level
      player.maxHealth += 10;
      player.health = player.maxHealth; // Full heal on level up
      
      this.omegga.broadcast(`<color="0ff">Congratulations! ${playerName} has reached level ${newPlayerLevel}!</color>`);
      console.log(`[Hoopla RPG] ${playerName} leveled up from ${oldPlayerLevel} to ${newPlayerLevel}!`);
      
      // Special handling for level 30 - grant flyer roles
      if (newPlayerLevel === 30) {
        this.omegga.broadcast(`<color="0ff">${playerName} can now fly and leave minigames at will!</color>`);
        await this.grantMaxLevelRoles(playerName);
      }
    }
    
    // 5. Handle skill level-up announcements
    if (skillLeveledUp && config.skillType) {
      this.omegga.broadcast(`<color="0ff">Congratulations! ${playerName} has reached ${config.skillType} level ${newSkillLevel}!</color>`);
      console.log(`[Hoopla RPG] ${playerName} leveled up ${config.skillType} from ${oldSkillLevel} to ${newSkillLevel}!`);
    }
    
    // 6. Save player data
    await this.playerService.setPlayerData({ id: playerId }, player);
    
    const result: XPGrantResult = {
      playerLeveledUp,
      skillLeveledUp,
      classLeveledUp,
      newPlayerLevel,
      newSkillLevel,
      newClassLevel,
      playerXP: player.experience,
      skillXP,
      classXP
    };
    
    return result;
  }

  /**
   * Calculates level from total XP using the XP requirements lookup table
   * 
   * @param totalXP - Total XP amount
   * @returns Calculated level (0-30)
   */
  private calculateLevelFromXP(totalXP: number): number {
    // Find the highest level the player can reach with their current XP
    for (let level = MAX_LEVEL; level >= 0; level--) {
      if (totalXP >= XP_REQUIREMENTS[level]) {
        return level;
      }
    }
    
    return 0; // Fallback to level 0
  }

  /**
   * Calculates XP needed for the next level using the XP requirements lookup table
   * 
   * @param currentLevel - Current level (0-29)
   * @returns XP required to reach the next level
   */
  private getXPForNextLevel(currentLevel: number): number {
    if (currentLevel >= MAX_LEVEL) return 0;
    
    const nextLevel = currentLevel + 1;
    const currentLevelXP = XP_REQUIREMENTS[currentLevel] || 0;
    const nextLevelXP = XP_REQUIREMENTS[nextLevel] || 0;
    
    return nextLevelXP - currentLevelXP;
  }

  /**
   * Gets XP progress information for a player
   * 
   * @param playerId - The ID of the player
   * @param skillType - Optional skill type to get progress for
   * @returns XP progress information
   */
  async getXPProgress(
    playerId: string,
    skillType?: SkillType
  ): Promise<{
    player: { level: number; xp: number; xpForNextLevel: number; progress: number };
    skill?: { level: number; xp: number; xpForNextLevel: number; progress: number };
    class?: { level: number; xp: number; xpForNextLevel: number; progress: number };
  }> {
    const player = await this.playerService.getPlayerData({ id: playerId });
    
    // Player progress
    const playerLevel = player.level || 0;
    const playerXP = player.experience || 0;
    const playerProgress = this.calculateXPProgress(playerLevel, playerXP);
    
    const result: any = {
      player: playerProgress
    };
    
    // Skill progress (if requested)
    if (skillType && player.skills?.[skillType]) {
      const skill = player.skills[skillType];
      const skillLevel = skill.level || 0;
      const skillXP = skill.experience || 0;
      result.skill = this.calculateXPProgress(skillLevel, skillXP);
    }
    
    // Class progress (if available)
    if (this.classesService) {
      const classData = await this.classesService.getPlayerClassLevel(playerId);
      if (classData) {
        const classLevel = classData.level || 0;
        const classXP = classData.xp || 0;
        result.class = this.calculateXPProgress(classLevel, classXP);
      }
    }
    
    return result;
  }

  /**
   * Calculates XP progress for a given level and XP using the XP requirements lookup table
   * 
   * @param level - Current level
   * @param totalXP - Total XP
   * @returns Progress information
   */
  private calculateXPProgress(level: number, totalXP: number): {
    level: number;
    xp: number;
    xpForNextLevel: number;
    progress: number;
  } {
    if (level >= MAX_LEVEL) {
      return {
        level: MAX_LEVEL,
        xp: 0,
        xpForNextLevel: 0,
        progress: 100
      };
    }
    
    // Get XP requirements from lookup table
    const currentLevelXP = XP_REQUIREMENTS[level] || 0;
    const nextLevelXP = XP_REQUIREMENTS[level + 1] || 0;
    
    const xpInCurrentLevel = totalXP - currentLevelXP;
    const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
    const progress = xpNeededForNextLevel > 0 ? 
      Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100)) : 0;
    
    return {
      level,
      xp: xpInCurrentLevel,
      xpForNextLevel: xpNeededForNextLevel,
      progress
    };
  }

  /**
   * Grants max level roles to a player
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
      console.error(`[Hoopla RPG] Error granting max level roles to ${playerName}:`, error);
      // Don't throw - role granting failure shouldn't break level-up
    }
  }
}
