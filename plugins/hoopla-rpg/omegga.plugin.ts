import OmeggaPlugin, { OL, PS, PC } from "omegga";
import Currency from "./currency";

/**
 * HOOPLA RPG PLUGIN
 * 
 * IMPORTANT: This plugin has been tested with actual Omegga methods.
 * Many brick modification methods we attempted do not exist:
 * - setBrick(), clearBrick(), setBrickVisible(), setBrickColor(), saveData()
 * - player.getTemplateBoundsData(), player.getTemplateBounds()
 * 
 * See OMEGGA_API_REFERENCE.md for confirmed working methods.
 * 
 * Current approach: Use chat feedback, console logging, and timer-based cooldowns
 * since direct brick modification is not possible with available Omegga APIs.
 * 
 * SIMPLIFIED: Mining nodes use simple cooldown tracking without visual changes.
 * Clean, minimal code focused on core RPG functionality.
 */

type PlayerId = { id: string };
type RPGPlayer = { 
  level: number; 
  experience: number; 
  health: number; 
  maxHealth: number;
  inventory: string[];
  nodesCollected: string[]; // Track which nodes the player has discovered
  skills: {
    mining: { level: number; experience: number };
    bartering: { level: number; experience: number };
    fishing: { level: number; experience: number };
  };
};

type BrickTrigger = {
  id: string;
  type: 'xp' | 'currency' | 'item' | 'heal' | 'sell' | 'fish';
  value: number;
  cooldown: number;
  lastUsed: { [playerId: string]: number };
  message: string;
  color?: string;
  // Brick interaction properties
  brickPositions?: Array<{ x: number; y: number; z: number }>;
  regionBounds?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  triggerType: 'click' | 'region' | 'proximity';
  proximityRadius?: number;
  // Mining progress tracking
  miningProgress?: { [playerId: string]: number };
  // Fishing progress tracking
  fishingProgress?: { [playerId: string]: number };
  // Fishing attempts remaining per node
  fishingAttemptsRemaining?: { [playerId: string]: number };
};

type Config = { 
  startingLevel: number; 
  startingHealth: number; 
  experienceMultiplier: number;
  healthRegenRate: number;
};

type Storage = { 
  [cur_uuid: string]: RPGPlayer;
};

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  currency: Currency;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    this.currency = new Currency(omegga);
  }

  defaultPlayer(): RPGPlayer {
    // Ensure starting level doesn't exceed max level
    const safeStartingLevel = Math.min(this.config.startingLevel, 20);
    
    return { 
      level: safeStartingLevel, 
      experience: 0, 
      health: this.config.startingHealth, 
      maxHealth: this.config.startingHealth,
      inventory: [],
      nodesCollected: [],
      skills: {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      }
    };
  }

  async getPlayerData({ id }: PlayerId): Promise<RPGPlayer> {
    return (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
  }

  async setPlayerData({ id }: PlayerId, data: RPGPlayer) {
    // Ensure levels don't exceed max level
    const safeData = { ...data };
    safeData.level = Math.min(safeData.level, 20);
    
    if (safeData.skills) {
      if (safeData.skills.mining) {
        safeData.skills.mining.level = Math.min(safeData.skills.mining.level, 20);
      }
      if (safeData.skills.bartering) {
        safeData.skills.bartering.level = Math.min(safeData.skills.bartering.level, 20);
      }
      if (safeData.skills.fishing) {
        safeData.skills.fishing.level = Math.min(safeData.skills.fishing.level, 20);
      }
    }
    
    await this.store.set("rpg_" + id, safeData);
  }

  // Fix a specific player who exceeded level 20
  async fixOverleveledPlayer(playerId: string): Promise<void> {
    try {
      const player = await this.getPlayerData({ id: playerId });
      let needsFix = false;
      
      // Check main level
      if (player.level > 20) {
        console.log(`[Hoopla RPG] Fixing overleveled player ${playerId}: ${player.level} → 20`);
        player.level = 20;
        needsFix = true;
      }
      
      // Check skill levels
      if (player.skills) {
        if (player.skills.mining?.level > 20) {
          console.log(`[Hoopla RPG] Fixing overleveled mining skill for player ${playerId}: ${player.skills.mining.level} → 20`);
          player.skills.mining.level = 20;
          needsFix = true;
        }
        if (player.skills.bartering?.level > 20) {
          console.log(`[Hoopla RPG] Fixing overleveled bartering skill for player ${playerId}: ${player.skills.bartering.level} → 20`);
          player.skills.bartering.level = 20;
          needsFix = true;
        }
        if (player.skills.fishing?.level > 20) {
          console.log(`[Hoopla RPG] Fixing overleveled fishing skill for player ${playerId}: ${player.skills.fishing.level} → 20`);
          player.skills.fishing.level = 20;
          needsFix = true;
        }
      }
      
      if (needsFix) {
        await this.setPlayerData({ id: playerId }, player);
        console.log(`[Hoopla RPG] Fixed overleveled player ${playerId}`);
      } else {
        console.log(`[Hoopla RPG] Player ${playerId} is not overleveled`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error fixing overleveled player ${playerId}:`, error);
    }
  }

  async updatePlayerData({ id }: PlayerId, data: Partial<RPGPlayer>) {
    const baseData = (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
    
    // Ensure levels don't exceed max level
    const safeData = { ...data };
    if (safeData.level !== undefined) {
      safeData.level = Math.min(safeData.level, 20);
    }
    if (safeData.skills) {
      if (safeData.skills.mining?.level !== undefined) {
        safeData.skills.mining.level = Math.min(safeData.skills.mining.level, 20);
      }
      if (safeData.skills.bartering?.level !== undefined) {
        safeData.skills.bartering.level = Math.min(safeData.skills.bartering.level, 20);
      }
      if (safeData.skills.fishing?.level !== undefined) {
        safeData.skills.fishing.level = Math.min(safeData.skills.fishing.level, 20);
      }
    }
    
    await this.store.set("rpg_" + id, { ...baseData, ...safeData });
  }

  async addExperience({ id }: PlayerId, amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    const player = await this.getPlayerData({ id });
    
    // Ensure all required properties exist with fallbacks
    if (player.level === undefined) player.level = this.config.startingLevel;
    if (player.experience === undefined) player.experience = 0;
    if (player.health === undefined) player.health = this.config.startingHealth;
    if (player.maxHealth === undefined) player.maxHealth = this.config.startingHealth;
    
    const oldLevel = player.level;
    
    // Don't add XP if already at max level
    if (oldLevel >= 20) {
      console.log(`[Hoopla RPG] Player ${id} is already at max level 20, XP not added`);
      return { 
        leveledUp: false, 
        newLevel: oldLevel 
      };
    }
    
    player.experience += amount;
    
    // Calculate new level using proper scaling system
    let newLevel = oldLevel;
    let xpForNextLevel = this.getXPForNextLevel(oldLevel);
    
    // Check if we can level up
    while (xpForNextLevel > 0 && player.experience >= xpForNextLevel && newLevel < 20) {
      newLevel++;
      xpForNextLevel = this.getXPForNextLevel(newLevel);
    }
    
    // Cap at level 20
    newLevel = Math.min(newLevel, 20);
    player.level = newLevel;
    
    // Increase max health with level (only if we actually leveled up)
    if (newLevel > oldLevel) {
      player.maxHealth += 10;
      player.health = player.maxHealth; // Full heal on level up
      
      // Announce level-up to the whole server
      const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
      this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level ${newLevel}!</color>`);
      console.log(`[Hoopla RPG] ${playerName} leveled up from ${oldLevel} to ${newLevel}!`);
    }
    
    await this.setPlayerData({ id }, player);
    
    return { 
      leveledUp: newLevel > oldLevel, 
      newLevel: newLevel 
    };
  }

  // Calculate XP needed to reach next level with reasonable scaling
  getXPForNextLevel(currentLevel: number): number {
    if (currentLevel >= 20) return 0; // Max level reached
    
    // Much more reasonable scaling: each level requires a moderate increase
    // Level 1: 100 XP, Level 2: 150 XP, Level 3: 200 XP, etc.
    // Uses a linear progression with slight increases for higher levels
    const baseXP = 100;
    const levelIncrease = 50; // +50 XP per level
    
    // Calculate total XP needed for next level
    const totalXP = baseXP + (currentLevel * levelIncrease);
    
    return totalXP;
  }

  // Calculate XP progress toward next level with proper scaling
  getXPProgress(currentXP: number, currentLevel: number): { current: number; needed: number; progress: number } {
    if (currentLevel >= 20) {
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

  // Standardize item casing to title case (first letter capitalized)
  standardizeItemCasing(itemName: string): string {
    if (!itemName || itemName.length === 0) return itemName;
    
    // Convert to lowercase first, then capitalize first letter
    const lowerCase = itemName.toLowerCase();
    return lowerCase.charAt(0).toUpperCase() + lowerCase.slice(1);
  }

  // Get sell price for different resources
  getResourceSellPrice(resourceType: string): number {
    switch (resourceType.toLowerCase()) {
      case 'copper': return 1;
      case 'iron': return 3;
      case 'gold': return 10;
      case 'gup': return 2;
      case 'cod': return 5;
      case 'shark': return 15;
      default: return 1; // Default price for unknown resources
    }
  }

  // Calculate XP reward based on resource rarity and skill level
  getXPReward(resourceType: string, skillLevel: number, skillType: 'mining' | 'fishing'): number {
    const resource = resourceType.toLowerCase();
    
    // Much higher base XP values to make leveling achievable
    let baseXP = 15; // Default base XP (increased from 5)
    
    // Mining resources
    if (skillType === 'mining') {
      if (resource === 'copper') baseXP = 15;     // Common (increased from 5)
      else if (resource === 'iron') baseXP = 25;  // Uncommon (increased from 8)
      else if (resource === 'gold') baseXP = 40;  // Rare (increased from 12)
    }
    
    // Fishing resources
    if (skillType === 'fishing') {
      if (resource === 'gup') baseXP = 15;        // Common (increased from 5)
      else if (resource === 'cod') baseXP = 25;   // Uncommon (increased from 8)
      else if (resource === 'shark') baseXP = 40; // Rare (increased from 12)
    }
    
    // Skill level bonus: higher skill levels get more XP
    // This encourages continued progression even at high levels
    const skillBonus = Math.floor(skillLevel * 0.5); // +0.5 XP per skill level (increased from 0.2)
    
    // Calculate final XP reward
    const finalXP = Math.max(1, baseXP + skillBonus);
    
    return finalXP;
  }

  // Calculate XP within current skill level
  getXPInCurrentSkillLevel(skillLevel: number, totalExperience: number): number {
    if (skillLevel === 0) return totalExperience;
    
    // Calculate XP threshold for current level using the same scaling as skills
    const baseXP = 100;
    const levelIncrease = 50; // Base increase
    
    let xpForCurrentLevel = baseXP;
    for (let level = 1; level < skillLevel; level++) {
      xpForCurrentLevel += levelIncrease + (level * 25); // Increasing difficulty
    }
    
    // Return XP within current level
    return totalExperience - xpForCurrentLevel;
  }

  // Add skill experience and check for level up
  async addSkillExperience({ id }: PlayerId, skillType: 'mining' | 'bartering' | 'fishing', amount: number): Promise<{ leveledUp: boolean; newLevel: number; currentXP: number; xpForNextLevel: number }> {
    const player = await this.getPlayerData({ id });
    
    // Ensure skills exist with fallbacks
    if (!player.skills) {
      player.skills = {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      };
    }
    
    // Ensure the specific skill type exists
    if (!player.skills[skillType]) {
      player.skills[skillType] = { level: 0, experience: 0 };
    }
    
    const skill = player.skills[skillType];
    
    // Double-check that skill is properly initialized
    if (!skill || typeof skill !== 'object') {
      console.error(`[Hoopla RPG] Skill object corruption detected for player ${id}, skill ${skillType}. Reinitializing.`);
      player.skills[skillType] = { level: 0, experience: 0 };
    }
    
    // Ensure level and experience properties exist
    if (typeof skill.level !== 'number') skill.level = 0;
    if (typeof skill.experience !== 'number') skill.experience = 0;
    
    const oldLevel = skill.level;
    
    // Don't add XP if already at max level
    if (oldLevel >= 20) {
      console.log(`[Hoopla RPG] Player ${id} is already at max ${skillType} level 20, XP not added`);
      return { 
        leveledUp: false, 
        newLevel: oldLevel, 
        currentXP: skill.experience,
        xpForNextLevel: 0
      };
    }
    
    skill.experience += amount;
    
    // Skill leveling: challenging progressive scaling
    // Each level requires significantly more XP than the previous
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 20) return 0;
      
      // Progressive scaling that gets much harder at higher levels
      // Level 1: 100 XP, Level 2: 200 XP, Level 3: 350 XP, Level 4: 550 XP, etc.
      // Each level requires more XP than the previous, with increasing difficulty
      const baseXP = 100;
      const levelIncrease = 50; // Base increase
      
      // Calculate XP needed for the current level
      let xpForCurrentLevel = baseXP;
      for (let level = 1; level < skillLevel; level++) {
        xpForCurrentLevel += levelIncrease + (level * 25); // Increasing difficulty
      }
      
      return xpForCurrentLevel;
    };
    
    // Calculate new level based on total experience
    let newLevel = 0;
    for (let level = 1; level <= 20; level++) {
      if (skill.experience >= getSkillXPForNextLevel(level)) {
        newLevel = level;
      } else {
        break;
      }
    }
    
    // Additional safety check: cap at level 20
    newLevel = Math.min(newLevel, 20);
    skill.level = newLevel;
    
    const leveledUp = newLevel > oldLevel;
    
    // Announce skill level-up to the whole server
    if (leveledUp) {
      const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
      this.omegga.broadcast(`<color="0ff">Congratulations! ${playerName} has reached ${skillType} level ${newLevel}!</color>`);
      console.log(`[Hoopla RPG] ${playerName} leveled up ${skillType} from ${oldLevel} to ${newLevel}!`);
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

  // Get skill level and XP progress with proper scaling
  async getSkillProgress({ id }: PlayerId, skillType: 'mining' | 'bartering' | 'fishing'): Promise<{ level: number; experience: number; xpForNextLevel: number; progress: number }> {
    const player = await this.getPlayerData({ id });
    
    if (!player.skills || !player.skills[skillType]) {
      return { level: 0, experience: 0, xpForNextLevel: 100, progress: 0 };
    }
    
    const skill = player.skills[skillType];
    
    // Calculate XP required for current and next level
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 20) return 0;
      
      // Progressive scaling that gets much harder at higher levels
      // Level 1: 100 XP, Level 2: 200 XP, Level 3: 350 XP, Level 4: 550 XP, etc.
      // Each level requires more XP than the previous, with increasing difficulty
      const baseXP = 100;
      const levelIncrease = 50; // Base increase
      
      // Calculate XP needed for the current level
      let xpForCurrentLevel = baseXP;
      for (let level = 1; level < skillLevel; level++) {
        xpForCurrentLevel += levelIncrease + (level * 25); // Increasing difficulty
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
      xpForNextLevel: xpNeededForNextLevel,
      progress
    };
  }

  // Calculate mining clicks required based on skill level and ore type
  getMiningClicksRequired(miningLevel: number, oreType: string): number {
    // Check if player can mine this ore type
    if (!this.canMineOreType(miningLevel, oreType)) {
      return -1; // Cannot mine this ore type
    }
    
    const ore = oreType.toLowerCase();
    
    // Copper: Available at level 0, scales from 0-20
    if (ore === 'copper') {
      if (miningLevel >= 20) return 1; // Max level = 1 click
      if (miningLevel >= 15) return 2; // Level 15-19 = 2 clicks
      if (miningLevel >= 10) return 2; // Level 10-14 = 2 clicks
      if (miningLevel >= 5) return 3;  // Level 5-9 = 3 clicks
      return 5; // Level 0-4 = 5 clicks
    }
    
    // Iron: Available at level 5, scales from 5-20
    if (ore === 'iron') {
      if (miningLevel >= 20) return 1; // Max level = 1 click
      if (miningLevel >= 15) return 2; // Level 15-19 = 2 clicks
      if (miningLevel >= 10) return 3; // Level 10-14 = 3 clicks
      if (miningLevel >= 5) return 4;  // Level 5-9 = 4 clicks
      return -1; // Cannot mine iron below level 5
    }
    
    // Gold: Available at level 10, scales from 10-20
    if (ore === 'gold') {
      if (miningLevel >= 20) return 2; // Max level = 2 clicks
      if (miningLevel >= 15) return 3; // Level 15-19 = 3 clicks
      if (miningLevel >= 10) return 4; // Level 10-14 = 4 clicks
      return -1; // Cannot mine gold below level 10
    }
    
    // Default for any other ore types
    if (miningLevel >= 20) return Math.max(1, Math.floor(5 * 0.2)); // Max level = 20% of base
    if (miningLevel >= 15) return Math.max(1, Math.floor(5 * 0.3)); // Level 15-19 = 30% of base
    if (miningLevel >= 10) return Math.max(1, Math.floor(5 * 0.4)); // Level 10-14 = 40% of base
    if (miningLevel >= 5) return Math.max(1, Math.floor(5 * 0.6));  // Level 5-9 = 60% of base
    return 5; // Level 0-4 = 100% of base (full clicks)
  }

  // Check if player can mine a specific ore type based on mining level
  canMineOreType(miningLevel: number, oreType: string): boolean {
    const ore = oreType.toLowerCase();
    
    // Copper: Available at any level
    if (ore === 'copper') return true;
    
    // Iron: Requires mining level 5
    if (ore === 'iron' && miningLevel < 5) return false;
    
    // Gold: Requires mining level 10
    if (ore === 'gold' && miningLevel < 10) return false;
    
    // Any other ore types are allowed
    return true;
  }

  // Calculate fishing clicks required based on skill level and fish type
  getFishingClicksRequired(fishingLevel: number, fishType: string): number {
    // Check if player can catch this fish type
    if (!this.canCatchFishType(fishingLevel, fishType)) {
      return -1; // Cannot catch this fish type
    }
    
    const fish = fishType.toLowerCase();
    
    // Gup: Available at level 0, scales from 0-20
    if (fish === 'gup') {
      if (fishingLevel >= 20) return 1; // Max level = 1 click
      if (fishingLevel >= 15) return 2; // Level 15-19 = 2 clicks
      if (fishingLevel >= 10) return 2; // Level 10-14 = 2 clicks
      if (fishingLevel >= 5) return 3;  // Level 5-9 = 3 clicks
      return 5; // Level 0-4 = 5 clicks
    }
    
    // Cod: Available at level 5, scales from 5-20
    if (fish === 'cod') {
      if (fishingLevel >= 20) return 1; // Max level = 1 click
      if (fishingLevel >= 15) return 2; // Level 15-19 = 2 clicks
      if (fishingLevel >= 10) return 3; // Level 10-14 = 3 clicks
      if (fishingLevel >= 5) return 4;  // Level 5-9 = 4 clicks
      return -1; // Cannot catch cod below level 5
    }
    
    // Shark: Available at level 10, scales from 10-20
    if (fish === 'shark') {
      if (fishingLevel >= 20) return 2; // Max level = 2 clicks
      if (fishingLevel >= 15) return 3; // Level 15-19 = 3 clicks
      if (fishingLevel >= 10) return 4; // Level 10-14 = 4 clicks
      return -1; // Cannot catch shark below level 10
    }
    
    // Default for any other fish types
    if (fishingLevel >= 20) return Math.max(1, Math.floor(5 * 0.2)); // Max level = 20% of base
    if (fishingLevel >= 15) return Math.max(1, Math.floor(5 * 0.3)); // Level 15-19 = 30% of base
    if (fishingLevel >= 10) return Math.max(1, Math.floor(5 * 0.4)); // Level 10-14 = 40% of base
    if (fishingLevel >= 5) return Math.max(1, Math.floor(5 * 0.6));  // Level 5-9 = 60% of base
    return 5; // Level 0-4 = 100% of base (full clicks)
  }

  // Calculate fishing failure chance based on fishing level
  getFishingFailureChance(fishingLevel: number): number {
    // Start at 50% failure at level 0, scale down to 5% at level 20
    const baseFailureRate = 0.50; // 50% at level 0
    const minFailureRate = 0.05;  // 5% at level 20
    const failureReduction = (baseFailureRate - minFailureRate) / 20; // Reduce by 2.25% per level
    
    return Math.max(minFailureRate, baseFailureRate - (fishingLevel * failureReduction));
  }

  // Determine what fish type to catch based on fishing level and RNG
  getRandomFishType(fishingLevel: number): { fishType: string; rarity: string } | null {
    // Calculate failure chance
    const failureChance = this.getFishingFailureChance(fishingLevel);
    if (Math.random() < failureChance) {
      return null; // Failed to catch anything
    }
    
    // Fish rarity distribution based on fishing level
    let gupChance = 0.70;  // Base chance for Gup (70%)
    let codChance = 0.25;  // Base chance for Cod (25%)
    let sharkChance = 0.05; // Base chance for Shark (5%)
    
    // Adjust chances based on fishing level
    if (fishingLevel >= 15) {
      // High level: Better chances for rare fish
      gupChance = 0.50;   // 50% Gup
      codChance = 0.35;   // 35% Cod
      sharkChance = 0.15; // 15% Shark
    } else if (fishingLevel >= 10) {
      // Mid level: Improved chances
      gupChance = 0.60;   // 60% Gup
      codChance = 0.30;   // 30% Cod
      sharkChance = 0.10; // 10% Shark
    } else if (fishingLevel >= 5) {
      // Low level: Slight improvement
      gupChance = 0.65;   // 65% Gup
      codChance = 0.30;   // 30% Cod
      sharkChance = 0.05; // 5% Shark
    }
    // Level 0-4: Use base chances
    
    // Generate random number and determine fish type
    const roll = Math.random();
    
    if (roll < gupChance) {
      return { fishType: 'Gup', rarity: 'Common' };
    } else if (roll < gupChance + codChance) {
      return { fishType: 'Cod', rarity: 'Uncommon' };
    } else {
      return { fishType: 'Shark', rarity: 'Rare' };
    }
  }

  // Check if player can catch a specific fish type based on fishing level
  canCatchFishType(fishingLevel: number, fishType: string): boolean {
    const fish = fishType.toLowerCase();
    
    // Gup: Available at any level
    if (fish === 'gup') return true;
    
    // Cod: Requires fishing level 5
    if (fish === 'cod' && fishingLevel < 5) return false;
    
    // Shark: Requires fishing level 10
    if (fish === 'shark' && fishingLevel < 10) return false;
    
    // Any other fish types are allowed
    return true;
  }

  // Calculate bartering multiplier based on skill level
  getBarteringMultiplier(barteringLevel: number): number {
    if (barteringLevel >= 20) return 2.0; // Max level = 2x
    if (barteringLevel >= 15) return 1.75; // Level 15-19 = 1.75x
    if (barteringLevel >= 10) return 1.5;  // Level 10-14 = 1.5x
    if (barteringLevel >= 5) return 1.25;  // Level 5-9 = 1.25x
    return 1.0; // Level 0-4 = 1x
  }

  // Create a visual progress bar using text characters
  createProgressBar(current: number, total: number, width: number = 20): string {
    const progress = Math.min(1, Math.max(0, current / total));
    const filledWidth = Math.round(progress * width);
    const emptyWidth = width - filledWidth;
    
    const filledChar = '='; // Equals character (will be colored green)
    const emptyChar = '-';  // Dash character (will be colored grey)
    
    const filledBar = filledChar.repeat(filledWidth);
    const emptyBar = emptyChar.repeat(emptyWidth);
    
    return `[<color="0f0">${filledBar}</color><color="888">${emptyBar}</color>]`;
  }

  getResourceColor(resourceName: string): string {
    const resource = resourceName.toLowerCase();
    
    // Mining resources
    if (resource === 'copper') return 'fff'; // White (Common)
    if (resource === 'iron') return '0f0';   // Green (Uncommon)
    if (resource === 'gold') return '00f';   // Blue (Rare)
    
    // Fishing resources
    if (resource === 'gup') return 'fff';    // White (Common)
    if (resource === 'cod') return '0f0';   // Green (Uncommon)
    if (resource === 'shark') return '00f';  // Blue (Rare)
    
    // Default to white for unknown resources
    return 'fff';
  }

  // Automatically detect and convert all mining nodes in the world
  async autoDetectMiningNodes(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

      console.log(`[Hoopla RPG] Auto-detecting mining nodes in the world...`);

      // Get all bricks from the world
      const saveData = await this.omegga.getSaveData();

      if (!saveData || !saveData.bricks || !Array.isArray(saveData.bricks) || saveData.bricks.length === 0) {
        throw new Error("No bricks found in the world!");
      }

             console.log(`[Hoopla RPG] Found ${saveData.bricks.length} total bricks in world`);

       

       // Filter to only bricks that have Component_Interact with RPG mining console tags
      const miningBricks: Array<{ brick: any; oreType: string; consoleTag: string }> = [];

      for (const brick of saveData.bricks) {
        // Use type assertion to access components property
        const brickWithComponents = brick as any;
        if (brickWithComponents.components && brickWithComponents.components.Component_Interact) {
          const consoleTag = brickWithComponents.components.Component_Interact.ConsoleTag || "";

          // Check if this brick has an RPG mining console tag
          if (consoleTag.startsWith("rpg_mining_")) {
            const oreType = consoleTag.replace("rpg_mining_", "");
            miningBricks.push({ brick, oreType, consoleTag });
            console.log(`[Hoopla RPG] Found mining brick: ${oreType} at [${brick.position.join(', ')}] with console tag: "${consoleTag}"`);
          }
        }
      }

      if (miningBricks.length === 0) {
        throw new Error("No RPG mining bricks found! Please set up bricks with Component_Interact and ConsoleTag like 'rpg_mining_iron' or 'rpg_mining_gold' using the Applicator tool first.");
      }

      console.log(`[Hoopla RPG] Found ${miningBricks.length} RPG mining bricks to convert`);

      // Get existing triggers to check for conflicts
      const existingTriggers = await this.getBrickTriggers();
      let convertedCount = 0;
      let skippedCount = 0;

      // Process each mining brick
      for (const { brick, oreType, consoleTag } of miningBricks) {
        try {
          // Extract position from brick
          let position = null;

          if (brick.position && Array.isArray(brick.position) && brick.position.length >= 3) {
            position = {
              x: brick.position[0],
              y: brick.position[1],
              z: brick.position[2]
            };
                     } else {
             console.log(`[Hoopla RPG] Skipping brick with invalid position format`);
             skippedCount++;
             continue;
           }

          // Check if this position already has a trigger
          let positionAlreadyUsed = false;
          for (const [triggerId, trigger] of Object.entries(existingTriggers)) {
            if (trigger.brickPositions) {
              for (const triggerPos of trigger.brickPositions) {
                                 if (triggerPos.x === position.x && triggerPos.y === position.y && triggerPos.z === position.z) {
                   console.log(`[Hoopla RPG] Position [${position.x}, ${position.y}, ${position.z}] already has trigger: ${triggerId}`);
                   positionAlreadyUsed = true;
                   break;
                 }
              }
              if (positionAlreadyUsed) break;
            }
          }

          if (positionAlreadyUsed) {
            skippedCount++;
            continue;
          }

          // Create the mining node trigger
          const nodeId = `mining_${oreType}_${Date.now()}_${convertedCount}`;
          const trigger: BrickTrigger = {
            id: nodeId,
            type: 'item',
            value: 1,
            cooldown: 60000, // 1 minute cooldown
            lastUsed: {},
            message: oreType,
            triggerType: 'click',
            brickPositions: [position]
          };

          // Save the trigger
          await this.createBrickTrigger(nodeId, trigger);
          convertedCount++;

                     console.log(`[Hoopla RPG] Created ${oreType} mining node at [${position.x}, ${position.y}, ${position.z}]`);

                 } catch (error) {
           console.error(`[Hoopla RPG] Error processing brick for ${oreType}:`, error);
           skippedCount++;
         }
      }

      // Notify the player of results
      if (convertedCount > 0) {
        this.omegga.whisper(speaker, `<color="0f0">Auto-detection completed!</color>`);
        this.omegga.whisper(speaker, `<color="0ff">Created: ${convertedCount} new mining nodes</color>`);
        if (skippedCount > 0) {
          this.omegga.whisper(speaker, `<color="ff0">Skipped: ${skippedCount} bricks (already converted or invalid)</color>`);
        }
        this.omegga.whisper(speaker, `<color="f0f">Click on the mining nodes to collect resources!</color>`);
      } else {
        this.omegga.whisper(speaker, `<color="ff0">No new mining nodes were created. All positions may already have triggers.</color>`);
      }

         } catch (error) {
       console.error(`[Hoopla RPG] Error auto-detecting mining nodes:`, error);
               this.omegga.whisper(speaker, `<color="f00">Failed to auto-detect mining nodes: ${error.message}</color>`);
      }
  }

  // Automatically detect and convert all fishing nodes in the world
  async autoDetectFishingNodes(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

      console.log(`[Hoopla RPG] Auto-detecting fishing nodes in the world...`);

      // Get all bricks from the world
      const saveData = await this.omegga.getSaveData();

      if (!saveData || !saveData.bricks || !Array.isArray(saveData.bricks) || saveData.bricks.length === 0) {
        throw new Error("No bricks found in the world!");
      }

      console.log(`[Hoopla RPG] Found ${saveData.bricks.length} total bricks in world`);

      // Filter to only bricks that have Component_Interact with RPG fishing console tags
      const fishingBricks: Array<{ brick: any; fishType: string; consoleTag: string }> = [];

      for (const brick of saveData.bricks) {
        // Use type assertion to access components property
        const brickWithComponents = brick as any;
        if (brickWithComponents.components && brickWithComponents.components.Component_Interact) {
          const consoleTag = brickWithComponents.components.Component_Interact.ConsoleTag || "";

          // Check if this brick has an RPG fishing console tag
          if (consoleTag.startsWith("rpg_fishing_")) {
            const fishType = consoleTag.replace("rpg_fishing_", "");
            fishingBricks.push({ brick, fishType, consoleTag });
            console.log(`[Hoopla RPG] Found fishing brick: ${fishType} at [${brick.position.join(', ')}] with console tag: "${consoleTag}"`);
          }
        }
      }

      if (fishingBricks.length === 0) {
        throw new Error("No RPG fishing bricks found! Please set up bricks with Component_Interact and ConsoleTag like 'rpg_fishing_spot' using the Applicator tool first.");
      }

      console.log(`[Hoopla RPG] Found ${fishingBricks.length} RPG fishing bricks to convert`);

      // Get existing triggers to check for conflicts
      const existingTriggers = await this.getBrickTriggers();
      let convertedCount = 0;
      let skippedCount = 0;

      // Process each fishing brick
      for (const { brick, fishType, consoleTag } of fishingBricks) {
        try {
          // Extract position from brick
          let position = null;

          if (brick.position && Array.isArray(brick.position) && brick.position.length >= 3) {
            position = {
              x: brick.position[0],
              y: brick.position[1],
              z: brick.position[2]
            };
          } else {
            console.log(`[Hoopla RPG] Skipping brick with invalid position format`);
            skippedCount++;
            continue;
          }

          // Check if this position already has a trigger
          let positionAlreadyUsed = false;
          for (const [triggerId, trigger] of Object.entries(existingTriggers)) {
            if (trigger.brickPositions) {
              for (const triggerPos of trigger.brickPositions) {
                if (triggerPos.x === position.x && triggerPos.y === position.y && triggerPos.z === position.z) {
                  console.log(`[Hoopla RPG] Position [${position.x}, ${position.y}, ${position.z}] already has trigger: ${triggerId}`);
                  positionAlreadyUsed = true;
                  break;
                }
              }
              if (positionAlreadyUsed) break;
            }
          }

          if (positionAlreadyUsed) {
            skippedCount++;
            continue;
          }

          // Create the fishing node trigger
          const nodeId = `fishing_spot_${Date.now()}_${convertedCount}`;
          const trigger: BrickTrigger = {
            id: nodeId,
            type: 'fish',
            value: 1,
            cooldown: 60000, // 1 minute cooldown
            lastUsed: {},
            message: 'fishing_spot', // Generic fishing spot
            triggerType: 'click',
            brickPositions: [position]
          };

          // Save the trigger
          await this.createBrickTrigger(nodeId, trigger);
          convertedCount++;

          console.log(`[Hoopla RPG] Created ${fishType} fishing node at [${position.x}, ${position.y}, ${position.z}]`);

        } catch (error) {
          console.error(`[Hoopla RPG] Error processing brick for ${fishType}:`, error);
          skippedCount++;
        }
      }

      // Notify the player of results
      if (convertedCount > 0) {
        this.omegga.whisper(speaker, `<color="0f0">Fishing auto-detection completed!</color>`);
        this.omegga.whisper(speaker, `<color="0ff">Created: ${convertedCount} new fishing nodes</color>`);
        if (skippedCount > 0) {
          this.omegga.whisper(speaker, `<color="ff0">Skipped: ${skippedCount} bricks (already converted or invalid)</color>`);
        }
        this.omegga.whisper(speaker, `<color="f0f">Click on the fishing nodes to catch fish!</color>`);
      } else {
        this.omegga.whisper(speaker, `<color="ff0">No new fishing nodes were created. All positions may already have triggers.</color>`);
      }

    } catch (error) {
      console.error(`[Hoopla RPG] Error auto-detecting fishing nodes:`, error);
      this.omegga.whisper(speaker, `<color="f00">Failed to auto-detect fishing nodes: ${error.message}</color>`);
    }
  }

  // Automatically detect and convert all shopkeeper bricks in the world
  async autoDetectShopkeepers(speaker: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

      console.log(`[Hoopla RPG] Auto-detecting shopkeeper bricks in the world...`);

      // Get all bricks from the world
      const saveData = await this.omegga.getSaveData();

      if (!saveData || !saveData.bricks || !Array.isArray(saveData.bricks) || saveData.bricks.length === 0) {
        throw new Error("No bricks found in the world!");
      }

             console.log(`[Hoopla RPG] Found ${saveData.bricks.length} total bricks in world`);

       

       // Filter to only bricks that have Component_Interact with RPG shopkeeper console tags
      const shopkeeperBricks: Array<{ brick: any; resourceType: string; consoleTag: string }> = [];

      for (const brick of saveData.bricks) {
        // Use type assertion to access components property
        const brickWithComponents = brick as any;
        if (brickWithComponents.components && brickWithComponents.components.Component_Interact) {
          const consoleTag = brickWithComponents.components.Component_Interact.ConsoleTag || "";

          // Check if this brick has an RPG shopkeeper console tag
          if (consoleTag.startsWith("rpg_sell_")) {
            const resourceType = consoleTag.replace("rpg_sell_", "");
            shopkeeperBricks.push({ brick, resourceType, consoleTag });
            console.log(`[Hoopla RPG] Found shopkeeper brick: ${resourceType} at [${brick.position.join(', ')}] with console tag: "${consoleTag}"`);
          }
        }
      }

      if (shopkeeperBricks.length === 0) {
        throw new Error("No RPG shopkeeper bricks found! Please set up bricks with Component_Interact and ConsoleTag like 'rpg_sell_copper' or 'rpg_sell_iron' using the Applicator tool first.");
      }

      console.log(`[Hoopla RPG] Found ${shopkeeperBricks.length} RPG shopkeeper bricks to convert`);

      // Get existing triggers to check for conflicts
      const existingTriggers = await this.getBrickTriggers();
      let convertedCount = 0;
      let skippedCount = 0;

      // Process each shopkeeper brick
      for (const { brick, resourceType, consoleTag } of shopkeeperBricks) {
        try {
          // Extract position from brick
          let position = null;

          if (brick.position && Array.isArray(brick.position) && brick.position.length >= 3) {
            position = {
              x: brick.position[0],
              y: brick.position[1],
              z: brick.position[2]
            };
          } else {
            console.log(`[Hoopla RPG] Skipping brick with invalid position format`);
            skippedCount++;
            continue;
          }

          // Check if this position already has a trigger
          let positionAlreadyUsed = false;
          for (const [triggerId, trigger] of Object.entries(existingTriggers)) {
            if (trigger.brickPositions) {
              for (const triggerPos of trigger.brickPositions) {
                if (triggerPos.x === position.x && triggerPos.y === position.y && triggerPos.z === position.z) {
                  console.log(`[Hoopla RPG] Position [${position.x}, ${position.y}, ${position.z}] already has trigger: ${triggerId}`);
                  positionAlreadyUsed = true;
                  break;
                }
              }
              if (positionAlreadyUsed) break;
            }
          }

          if (positionAlreadyUsed) {
            skippedCount++;
            continue;
          }

          // Create the shopkeeper trigger
          const shopkeeperId = `shopkeeper_${resourceType}_${Date.now()}_${convertedCount}`;
          const sellPrice = this.getResourceSellPrice(resourceType);
          const trigger: BrickTrigger = {
            id: shopkeeperId,
            type: 'sell',
            value: sellPrice,
            cooldown: 0, // No cooldown for selling
            lastUsed: {},
            message: resourceType,
            triggerType: 'click',
            brickPositions: [position]
          };

          // Save the trigger
          await this.createBrickTrigger(shopkeeperId, trigger);
          convertedCount++;

          console.log(`[Hoopla RPG] Created ${resourceType} shopkeeper at [${position.x}, ${position.y}, ${position.z}] with price ${sellPrice}`);

        } catch (error) {
          console.error(`[Hoopla RPG] Error processing brick for ${resourceType}:`, error);
          skippedCount++;
        }
      }

      // Notify the player of results
      if (convertedCount > 0) {
        this.omegga.whisper(speaker, `<color="0f0">Shopkeeper auto-detection completed!</color>`);
        this.omegga.whisper(speaker, `<color="0ff">Created: ${convertedCount} new shopkeepers</color>`);
        if (skippedCount > 0) {
          this.omegga.whisper(speaker, `<color="ff0">Skipped: ${skippedCount} bricks (already converted or invalid)</color>`);
        }
        this.omegga.whisper(speaker, `<color="f0f">Click on the shopkeepers to sell resources!</color>`);
      } else {
        this.omegga.whisper(speaker, `<color="ff0">No new shopkeepers were created. All positions may already have triggers.</color>`);
      }

    } catch (error) {
      console.error(`[Hoopla RPG] Error auto-detecting shopkeepers:`, error);
      this.omegga.whisper(speaker, `<color="f00">Failed to auto-detect shopkeepers: ${error.message}</color>`);
    }
  }

  async healPlayer({ id }: PlayerId, amount: number): Promise<{ newHealth: number; healed: number }> {
    const player = await this.getPlayerData({ id });
    
    // Ensure health properties exist with fallbacks
    if (player.health === undefined) player.health = this.config.startingHealth;
    if (player.maxHealth === undefined) player.maxHealth = this.config.startingHealth;
    
    const oldHealth = player.health;
    
    player.health = Math.min(player.health + amount, player.maxHealth);
    const healed = player.health - oldHealth;
    
    await this.setPlayerData({ id }, player);
    
    return { newHealth: player.health, healed };
  }

  async addToInventory({ id }: PlayerId, item: string): Promise<string[]> {
    const player = await this.getPlayerData({ id });
    // Ensure inventory array exists
    if (!player.inventory) {
      player.inventory = [];
    }
    player.inventory.push(item);
    await this.setPlayerData({ id }, player);
    return player.inventory;
  }

  async removeFromInventory({ id }: PlayerId, item: string): Promise<boolean> {
    const player = await this.getPlayerData({ id });
    // Ensure inventory array exists
    if (!player.inventory) {
      player.inventory = [];
      return false;
    }
    
    const index = player.inventory.indexOf(item);
    if (index > -1) {
      player.inventory.splice(index, 1);
      await this.setPlayerData({ id }, player);
      return true;
    }
    return false;
  }

  // Node collection tracking
  async addNodeToCollection({ id }: PlayerId, nodeId: string): Promise<void> {
    const player = await this.getPlayerData({ id });
    // Ensure nodesCollected array exists
    if (!player.nodesCollected) {
      player.nodesCollected = [];
    }
    
    if (!player.nodesCollected.includes(nodeId)) {
      player.nodesCollected.push(nodeId);
      await this.setPlayerData({ id }, player);
    }
  }

  async getNodeCollectionCount({ id }: PlayerId): Promise<number> {
    const player = await this.getPlayerData({ id });
    return player.nodesCollected?.length ?? 0;
  }

  // Brick trigger methods
  async getBrickTriggers(): Promise<{ [triggerId: string]: BrickTrigger }> {
    const data = await this.store.get("brick_triggers");
    return data && typeof data === 'object' && 'brickTriggers' in data ? (data as any).brickTriggers : {};
  }



  async setBrickTriggers(triggers: { [triggerId: string]: BrickTrigger }) {
    await this.store.set("brick_triggers", { brickTriggers: triggers });
  }

  async createBrickTrigger(triggerId: string, trigger: BrickTrigger): Promise<void> {
    const triggers = await this.getBrickTriggers();
    triggers[triggerId] = trigger;
    await this.setBrickTriggers(triggers);
  }

  async removeBrickTrigger(triggerId: string): Promise<boolean> {
    const triggers = await this.getBrickTriggers();
    if (triggers[triggerId]) {
      delete triggers[triggerId];
      await this.setBrickTriggers(triggers);
      return true;
    }
    return false;
  }

      // Track mining node cooldown status (simplified - no visual changes)
  async setMiningNodeStatus(triggerId: string, active: boolean): Promise<void> {
    try {
      const triggers = await this.getBrickTriggers();
      const trigger = triggers[triggerId];
      
      if (!trigger || !trigger.brickPositions) {
        return;
      }

      // Only apply to mining nodes (item type triggers)
      if (trigger.type !== 'item') {
        return;
      }

      // Update each brick position
      for (const position of trigger.brickPositions) {
        if (active) {
          console.log(`[Hoopla RPG] 🟢 Mining node at [${position.x}, ${position.y}, ${position.z}] is now ACTIVE and ready to mine`);
        } else {
          console.log(`[Hoopla RPG] 🔴 Mining node at [${position.x}, ${position.y}, ${position.z}] is now DEPLETED and on cooldown`);
        }
      }

      console.log(`[Hoopla RPG] Updated status for ${trigger.brickPositions.length} mining node(s)`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error updating mining node status for trigger ${triggerId}:`, error);
    }
  }

  // Get cooldown status for a specific mining node
  async getMiningNodeCooldownStatus(triggerId: string, playerId: string): Promise<{ active: boolean; remainingTime: number }> {
    try {
      const triggers = await this.getBrickTriggers();
      const trigger = triggers[triggerId];
      
      if (!trigger || trigger.type !== 'item') {
        return { active: true, remainingTime: 0 };
      }

      const now = Date.now();
      const lastUsed = trigger.lastUsed[playerId] || 0;
      const remainingTime = Math.max(0, trigger.cooldown - (now - lastUsed));
      const active = remainingTime === 0;

      return { active, remainingTime };
    } catch (error) {
      console.error(`[Hoopla RPG] Error getting cooldown status for trigger ${triggerId}:`, error);
      return { active: true, remainingTime: 0 };
    }
  }

    // Restore status for all mining nodes (useful after server restart)
  async restoreAllMiningNodeStatus(): Promise<void> {
    try {
      const triggers = await this.getBrickTriggers();
      let restoredCount = 0;
      
      for (const [triggerId, trigger] of Object.entries(triggers)) {
        if (trigger.type === 'item' && trigger.brickPositions) {
          // Check if cooldown has expired
          const now = Date.now();
          const lastUsed = Object.values(trigger.lastUsed).reduce((latest, time) => Math.max(latest, time), 0);
          
          if (now - lastUsed >= trigger.cooldown) {
            // Cooldown has expired, make node active again
            await this.setMiningNodeStatus(triggerId, true);
            restoredCount++;
          }
        }
      }
      
      if (restoredCount > 0) {
        console.log(`[Hoopla RPG] Restored status for ${restoredCount} mining nodes after cooldown expiration`);
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error restoring mining node status:`, error);
    }
  }

  async triggerBrickAction(playerId: string, triggerId: string): Promise<{ success: boolean; message: string; reward?: any }> {
    const triggers = await this.getBrickTriggers();
    const trigger = triggers[triggerId];
    
    if (!trigger) {
      return { success: false, message: "Trigger not found!" };
    }
    


    // Track node discovery for the player
    await this.addNodeToCollection({ id: playerId }, triggerId);

    // Process the trigger
    try {
      switch (trigger.type) {
        case 'xp':
          // Check cooldown for non-mining triggers
          const xpNow = Date.now();
          const xpLastUsed = trigger.lastUsed[playerId] || 0;
          if (xpNow - xpLastUsed < trigger.cooldown) {
            const remaining = Math.ceil((trigger.cooldown - (xpNow - xpLastUsed)) / 1000);
            const cooldownMessage = `Cooldown active! Try again in ${remaining} seconds.`;
            this.omegga.middlePrint(playerId, cooldownMessage);
            return { success: false, message: cooldownMessage };
          }
          
          // Update last used time for non-mining triggers
          trigger.lastUsed[playerId] = xpNow;
          await this.setBrickTriggers(triggers);
          
          const xpResult = await this.addExperience({ id: playerId }, trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', trigger.value.toString()),
            reward: { type: 'xp', amount: trigger.value, leveledUp: xpResult.leveledUp, newLevel: xpResult.newLevel }
          };

        case 'currency':
          // Check cooldown for non-mining triggers
          const currencyNow = Date.now();
          const currencyLastUsed = trigger.lastUsed[playerId] || 0;
          if (currencyNow - currencyLastUsed < trigger.cooldown) {
            const remaining = Math.ceil((trigger.cooldown - (currencyNow - currencyLastUsed)) / 1000);
            const cooldownMessage = `Cooldown active! Try again in ${remaining} seconds.`;
            this.omegga.middlePrint(playerId, cooldownMessage);
            return { success: false, message: cooldownMessage };
          }
          
          // Update last used time for non-mining triggers
          trigger.lastUsed[playerId] = currencyNow;
          await this.setBrickTriggers(triggers);
          
          await this.currency.add(playerId, "currency", trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', (await this.currency.format(trigger.value))),
            reward: { type: 'currency', amount: trigger.value }
          };

        case 'item':
          // Check cooldown only if this is a fresh mining attempt (no progress)
          if (!trigger.miningProgress || !trigger.miningProgress[playerId]) {
            const now = Date.now();
            const lastUsed = trigger.lastUsed[playerId] || 0;
            if (now - lastUsed < trigger.cooldown) {
              const remaining = Math.ceil((trigger.cooldown - (now - lastUsed)) / 1000);
              const cooldownMessage = `Cooldown active! Try again in ${remaining} seconds.`;
              this.omegga.middlePrint(playerId, cooldownMessage);
              return { success: false, message: cooldownMessage };
            }
          }
          
          // Get player's mining skill level
          const miningPlayer = await this.getPlayerData({ id: playerId });
          const miningLevel = miningPlayer.skills?.mining?.level || 0;
          const oreType = trigger.message; // The ore type is stored in trigger.message
          
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
            } else {
              const requirementMessage = `You need a higher mining level to mine ${oreType}!`;
              this.omegga.middlePrint(playerId, requirementMessage);
              return { 
                success: false, 
                message: requirementMessage,
                reward: { type: 'mining_requirement', required: 'unknown', current: miningLevel }
              };
            }
          }
          
          const clicksRequired = this.getMiningClicksRequired(miningLevel, oreType);
          
          // Initialize mining progress if not exists
          if (!trigger.miningProgress) {
            trigger.miningProgress = {};
          }
          
          // Get current progress and increment
          const previousProgress = trigger.miningProgress[playerId] || 0;
          const currentProgress = previousProgress + 1;
          trigger.miningProgress[playerId] = currentProgress;
          
          // Simple progress logging to debug the issue
          console.log(`[Hoopla RPG] Mining progress: ${previousProgress} → ${currentProgress} / ${clicksRequired}`);
          console.log(`[Hoopla RPG] Progress types: previous=${typeof previousProgress}, current=${typeof currentProgress}`);
          
          // Check if mining is complete
          if (currentProgress < clicksRequired) {
            // Update trigger data
            triggers[triggerId] = trigger;
            await this.setBrickTriggers(triggers);
            
            const remainingClicks = clicksRequired - currentProgress;
            const progressBar = this.createProgressBar(currentProgress, clicksRequired);
            
            // Log the progress calculation
            console.log(`[Hoopla RPG] Progress: ${currentProgress}/${clicksRequired} = ${((currentProgress/clicksRequired)*100).toFixed(1)}%`);
            
            // Use middlePrint for progress updates
            this.omegga.middlePrint(playerId, `Mining ${trigger.message}... ${progressBar}`);
            
            return { 
              success: true, 
              message: `Mining ${trigger.message}... ${progressBar}`,
              reward: { type: 'mining_progress', progress: currentProgress, required: clicksRequired, remaining: remainingClicks }
            };
          }
          
          // Mining complete - add to inventory and grant XP with standardized casing
          const standardizedOreType = this.standardizeItemCasing(trigger.message);
          await this.addToInventory({ id: playerId }, standardizedOreType);
          
          // Calculate XP rewards based on ore rarity and mining skill level
          const generalXP = this.getXPReward(trigger.message, miningLevel, 'mining');
          const miningXP = this.getXPReward(trigger.message, miningLevel, 'mining');
          
          // Grant XP for mining
          const miningXpResult = await this.addExperience({ id: playerId }, generalXP);
          
          // Grant Mining XP
          const miningSkillResult = await this.addSkillExperience({ id: playerId }, 'mining', miningXP);
          
          // Reset mining progress for this player
          trigger.miningProgress[playerId] = 0;
          
          // NOW trigger the cooldown after successful mining
          const now = Date.now();
          trigger.lastUsed[playerId] = now;
          
          // Mark the mining node as depleted during cooldown
          await this.setMiningNodeStatus(triggerId, false);
          
          // Set a timer to restore its status when cooldown expires
          setTimeout(async () => {
            try {
              await this.setMiningNodeStatus(triggerId, true);
            } catch (error) {
              console.error(`[Hoopla RPG] Error restoring mining node status after cooldown:`, error);
            }
          }, trigger.cooldown);
          
          // Get updated inventory to show total count
          const updatedPlayer = await this.getPlayerData({ id: playerId });
          const itemCount = updatedPlayer.inventory.filter(item => item === standardizedOreType).length;
          
          // New simplified message format with middlePrint - items in brackets with rarity colors
          const resourceColor = this.getResourceColor(standardizedOreType);
          const message = `Mined 1 <color="${resourceColor}">[${standardizedOreType}]</color> (<color="ff0">x${itemCount}</color> in bag), Gained ${generalXP}XP and ${miningXP} Mining XP`;
          
          // Use middlePrint for the result
          this.omegga.middlePrint(playerId, message);
          
          // Update trigger data
          triggers[triggerId] = trigger;
          await this.setBrickTriggers(triggers);
          
          return { 
            success: true, 
            message: message,
            reward: { 
              type: 'item', 
              item: standardizedOreType, 
              xpGained: generalXP, 
              miningXpGained: miningXP,
              leveledUp: miningXpResult.leveledUp, 
              newLevel: miningXpResult.newLevel,
              miningSkillLeveledUp: miningSkillResult.leveledUp,
              newMiningLevel: miningSkillResult.newLevel
            }
          };

        case 'fish':
          try {
            // Check cooldown only if this is a fresh fishing node (no attempts remaining)
            if (!trigger.fishingAttemptsRemaining || !trigger.fishingAttemptsRemaining[playerId]) {
              const now = Date.now();
              const lastUsed = trigger.lastUsed[playerId] || 0;
              if (now - lastUsed < trigger.cooldown) {
                const remaining = Math.ceil((trigger.cooldown - (now - lastUsed)) / 1000);
                const cooldownMessage = `Cooldown active! Try again in ${remaining} seconds.`;
                this.omegga.middlePrint(playerId, cooldownMessage);
                return { success: false, message: cooldownMessage };
              }
              
                          // Initialize fishing attempts for this player (5 attempts per node)
            if (!trigger.fishingAttemptsRemaining) {
              trigger.fishingAttemptsRemaining = {};
            }
            trigger.fishingAttemptsRemaining[playerId] = 5;
            console.log(`[Hoopla RPG] Initialized fishing node for player ${playerId} with 5 attempts`);
            
            // Also ensure fishing progress is initialized
            if (!trigger.fishingProgress) {
              trigger.fishingProgress = {};
            }
            if (!trigger.fishingProgress[playerId]) {
              trigger.fishingProgress[playerId] = 0;
            }
            }
          
          // Get player's fishing skill level
          const fishingPlayer = await this.getPlayerData({ id: playerId });
          
          // Validate fishing skills data
          if (!fishingPlayer.skills) {
            console.log(`[Hoopla RPG] Player ${playerId} has no skills object, initializing...`);
            fishingPlayer.skills = {
              mining: { level: 0, experience: 0 },
              bartering: { level: 0, experience: 0 },
              fishing: { level: 0, experience: 0 }
            };
            await this.setPlayerData({ id: playerId }, fishingPlayer);
          }
          
          if (!fishingPlayer.skills.fishing) {
            console.log(`[Hoopla RPG] Player ${playerId} has no fishing skill, initializing...`);
            fishingPlayer.skills.fishing = { level: 0, experience: 0 };
            await this.setPlayerData({ id: playerId }, fishingPlayer);
          }
          
          const fishingLevel = fishingPlayer.skills.fishing.level || 0;
          
          // Initialize fishing progress if not exists
          if (!trigger.fishingProgress) {
            trigger.fishingProgress = {};
          }
          if (!trigger.fishingProgress[playerId]) {
            trigger.fishingProgress[playerId] = 0;
          }
          
          // Increment fishing progress
          const currentFishingProgress = trigger.fishingProgress[playerId] + 1;
          trigger.fishingProgress[playerId] = currentFishingProgress;
          
          console.log(`[Hoopla RPG] Fishing progress for player ${playerId}: ${currentFishingProgress} clicks, attempts remaining: ${trigger.fishingAttemptsRemaining?.[playerId] || 'undefined'}`);
          
          // Determine clicks required based on fishing level (using Gup as base since it's always available)
          const fishingClicksRequired = this.getFishingClicksRequired(fishingLevel, 'gup');
          
          // Check if fishing is complete
          if (currentFishingProgress < fishingClicksRequired) {
            // Update trigger data
            triggers[triggerId] = trigger;
            await this.setBrickTriggers(triggers);
            
            const remainingClicks = fishingClicksRequired - currentFishingProgress;
            const attemptsLeft = trigger.fishingAttemptsRemaining?.[playerId] || 0;
            
            // Validate that attempts are properly tracked
            if (!trigger.fishingAttemptsRemaining || !trigger.fishingAttemptsRemaining[playerId]) {
              console.error(`[Hoopla RPG] Fishing attempts tracking error for player ${playerId}. Attempts object:`, trigger.fishingAttemptsRemaining);
              // Re-initialize attempts if they're missing
              if (!trigger.fishingAttemptsRemaining) {
                trigger.fishingAttemptsRemaining = {};
              }
              trigger.fishingAttemptsRemaining[playerId] = 5;
              console.log(`[Hoopla RPG] Re-initialized fishing attempts for player ${playerId}`);
            }
            
            // Final safety check before returning
            const finalAttemptsLeft = trigger.fishingAttemptsRemaining[playerId];
            console.log(`[Hoopla RPG] Returning fishing progress for player ${playerId}: ${currentFishingProgress}/${fishingClicksRequired} clicks, ${finalAttemptsLeft} attempts remaining`);
            
            const progressBar = this.createProgressBar(currentFishingProgress, fishingClicksRequired);
            
            // Use middlePrint for progress updates
            this.omegga.middlePrint(playerId, `Fishing... ${progressBar} - ${finalAttemptsLeft} attempts remaining`);
            
            return { 
              success: true, 
              message: `Fishing... ${progressBar} - ${finalAttemptsLeft} attempts remaining`,
              reward: { type: 'fishing_progress', progress: currentFishingProgress, required: fishingClicksRequired, remaining: remainingClicks, attemptsRemaining: finalAttemptsLeft }
            };
          }
          
                    // Fishing complete - determine what was caught
          const fishResult = this.getRandomFishType(fishingLevel);
          
          // Reset fishing progress for this player
          trigger.fishingProgress[playerId] = 0;
          
          // Decrease attempts remaining AFTER fishing is complete
          // Validate attempts tracking before decrementing
          if (!trigger.fishingAttemptsRemaining || !trigger.fishingAttemptsRemaining[playerId]) {
            console.error(`[Hoopla RPG] Fishing attempts tracking error for player ${playerId} when completing fishing. Attempts object:`, trigger.fishingAttemptsRemaining);
            // Re-initialize attempts if they're missing
            if (!trigger.fishingAttemptsRemaining) {
              trigger.fishingAttemptsRemaining = {};
            }
            trigger.fishingAttemptsRemaining[playerId] = 5;
            console.log(`[Hoopla RPG] Re-initialized fishing attempts for player ${playerId} when completing fishing`);
          }
          
          trigger.fishingAttemptsRemaining[playerId]--;
          const attemptsRemaining = trigger.fishingAttemptsRemaining[playerId];
          
          console.log(`[Hoopla RPG] Fishing complete for player ${playerId}. Fish result:`, fishResult ? `${fishResult.fishType}` : 'Failed to catch', `Attempts remaining: ${attemptsRemaining}`);
          
          if (!fishResult) {
            // Failed to catch anything
            const failureMessage = `The fish got away! Better luck next time. - ${attemptsRemaining} attempts remaining`;
            
            // Check if this was the last attempt
            if (attemptsRemaining <= 0) {
              // Node is depleted - trigger cooldown
              const fishingNow = Date.now();
              trigger.lastUsed[playerId] = fishingNow;
              
              console.log(`[Hoopla RPG] Fishing node depleted for player ${playerId}. Triggering 60s cooldown.`);
              
              // Clear attempts remaining for this player
              delete trigger.fishingAttemptsRemaining[playerId];
              
              // Update trigger data
              triggers[triggerId] = trigger;
              await this.setBrickTriggers(triggers);
              
              // Combined message for final attempt: failure + depletion notice (prevents message overlap)
              const combinedFailureMessage = `The fish got away! Better luck next time. - Fishing spot depleted! Come back in 60 seconds.`;
              this.omegga.middlePrint(playerId, combinedFailureMessage);
              
              return { 
                success: true, 
                message: combinedFailureMessage,
                reward: { 
                  type: 'fishing_node_depleted', 
                  failureRate: this.getFishingFailureChance(fishingLevel),
                  fishingLevel: fishingLevel
                }
              };
            }
            
            // Use middlePrint for the failure message
            this.omegga.middlePrint(playerId, failureMessage);
            
            // Update trigger data
            triggers[triggerId] = trigger;
            await this.setBrickTriggers(triggers);
            
            return { 
              success: true, 
              message: failureMessage,
              reward: { 
                type: 'fishing_failure', 
                failureRate: this.getFishingFailureChance(fishingLevel),
                fishingLevel: fishingLevel,
                attemptsRemaining: attemptsRemaining
              }
            };
          }
          
          // Successfully caught a fish
          const { fishType, rarity } = fishResult;
          
          // Add fish to inventory
          await this.addToInventory({ id: playerId }, fishType);
          
          // Calculate XP rewards based on fish rarity and fishing skill level
          const generalXP = this.getXPReward(fishType, fishingLevel, 'fishing');
          const fishingXP = this.getXPReward(fishType, fishingLevel, 'fishing');
          
          // Grant XP for fishing
          const fishingXpResult = await this.addExperience({ id: playerId }, generalXP);
          
          // Grant Fishing XP
          console.log(`[Hoopla RPG] Adding ${fishingXP} fishing XP to player ${playerId}. Current skills:`, fishingPlayer.skills);
          const fishingSkillResult = await this.addSkillExperience({ id: playerId }, 'fishing', fishingXP);
          console.log(`[Hoopla RPG] Fishing XP result for player ${playerId}:`, fishingSkillResult);
          
          // Check if this was the last attempt
          if (attemptsRemaining <= 0) {
            // Node is depleted - trigger cooldown
            const fishingNow = Date.now();
            trigger.lastUsed[playerId] = fishingNow;
            
            console.log(`[Hoopla RPG] Fishing node depleted for player ${playerId} after successful catch. Triggering 60s cooldown.`);
            
            // Clear attempts remaining for this player
            delete trigger.fishingAttemptsRemaining[playerId];
            
            // Get updated inventory to show total count
            const updatedFishingPlayer = await this.getPlayerData({ id: playerId });
            const fishCount = updatedFishingPlayer.inventory.filter(item => item === fishType).length;
            
            // Combined message for final attempt: fish result + depletion notice (prevents message overlap)
            const fishColor = this.getResourceColor(fishType);
            const fishingMessage = `Caught 1 <color="${fishColor}">[${fishType}]</color> (<color="ff0">x${fishCount}</color> in bag), Gained ${generalXP}XP and ${fishingXP} Fishing XP - Fishing spot depleted! Come back in 60 seconds.`;
            
            // Use middlePrint for the combined result
            this.omegga.middlePrint(playerId, fishingMessage);
            
            // Update trigger data
            triggers[triggerId] = trigger;
            await this.setBrickTriggers(triggers);
            
            return { 
              success: true, 
              message: fishingMessage,
              reward: { 
                type: 'fish', 
                item: fishType, 
                rarity: rarity,
                xpGained: generalXP, 
                fishingXpGained: fishingXP,
                leveledUp: fishingXpResult.leveledUp, 
                newLevel: fishingXpResult.newLevel,
                fishingSkillLeveledUp: fishingSkillResult.leveledUp,
                newFishingLevel: fishingSkillResult.newLevel,
                nodeDepleted: true
              }
            };
          }
          
          // Get updated inventory to show total count
          const updatedFishingPlayer = await this.getPlayerData({ id: playerId });
          const fishCount = updatedFishingPlayer.inventory.filter(item => item === fishType).length;
          
          // Regular fishing result (not the final attempt)
          const fishColor = this.getResourceColor(fishType);
          const fishingMessage = `Caught 1 <color="${fishColor}">[${fishType}]</color> (<color="ff0">x${fishCount}</color> in bag), Gained ${generalXP}XP and ${fishingXP} Fishing XP - ${attemptsRemaining} attempts remaining`;
          
          // Use middlePrint for the regular result
          this.omegga.middlePrint(playerId, fishingMessage);
          
          // Update trigger data
          triggers[triggerId] = trigger;
          await this.setBrickTriggers(triggers);
          
          return { 
            success: true, 
            message: fishingMessage,
            reward: { 
              type: 'fish', 
              item: fishType, 
              rarity: rarity,
              xpGained: generalXP, 
              fishingXpGained: fishingXP,
              leveledUp: fishingXpResult.leveledUp, 
              newLevel: fishingXpResult.newLevel,
              fishingSkillLeveledUp: fishingSkillResult.leveledUp,
              newFishingLevel: fishingSkillResult.newLevel,
              attemptsRemaining: attemptsRemaining
            }
          };
          
          } catch (error) {
            console.error(`[Hoopla RPG] Error processing fishing trigger for player ${playerId}:`, error);
            const errorMessage = `An error occurred while fishing. Please try again.`;
            this.omegga.middlePrint(playerId, errorMessage);
            return { 
              success: false, 
              message: errorMessage,
              reward: { type: 'fishing_error', error: error.message }
            };
          }

        case 'heal':
          const healResult = await this.healPlayer({ id: playerId }, trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', trigger.value.toString()),
            reward: { type: 'heal', amount: trigger.value, healed: healResult.healed }
          };

        case 'sell':
          // Check if player has the resource to sell (case-insensitive)
          const sellPlayer = await this.getPlayerData({ id: playerId });
          
          // Find the item in inventory with case-insensitive matching
          const itemToSell = sellPlayer.inventory?.find(item => 
            item.toLowerCase() === trigger.message.toLowerCase()
          );
          
          console.log(`[Hoopla RPG] Selling attempt for player ${playerId}:`);
          console.log(`  - Looking for: "${this.standardizeItemCasing(trigger.message)}"`);
          console.log(`  - Inventory contains:`, sellPlayer.inventory);
          console.log(`  - Found item: "${itemToSell}"`);
          
          if (!sellPlayer.inventory || !itemToSell) {
            const standardizedItemName = this.standardizeItemCasing(trigger.message);
            const noItemMessage = `You don't have any ${standardizedItemName} to sell!`;
            this.omegga.middlePrint(playerId, noItemMessage);
            return { 
              success: false, 
              message: noItemMessage
            };
          }

          // Get player's bartering skill level
          const barteringLevel = sellPlayer.skills?.bartering?.level || 0;
          const barteringMultiplier = this.getBarteringMultiplier(barteringLevel);
          const basePrice = trigger.value;
          const finalPrice = Math.floor(basePrice * barteringMultiplier);

          // Remove one item from inventory (using the found item to preserve case)
          await this.removeFromInventory({ id: playerId }, itemToSell);
          
          // Add currency with bartering bonus
          await this.currency.add(playerId, "currency", finalPrice);
          
          // Calculate bartering XP based on item rarity and bartering skill level
          const barteringXP = this.getXPReward(itemToSell, barteringLevel, 'mining'); // Use mining as proxy for resource rarity
          const barteringSkillResult = await this.addSkillExperience({ id: playerId }, 'bartering', barteringXP);
          
          // Get updated player data for display
          const updatedPlayerData = await this.getPlayerData({ id: playerId });
          const remainingCount = updatedPlayerData.inventory.filter(item => item === itemToSell).length;
          const newCurrency = await this.currency.getCurrency(playerId);
          const formattedCurrency = await this.currency.format(newCurrency);
          
          // Enhanced message showing bartering bonus with color coding - items in brackets with rarity colors
          const itemColor = this.getResourceColor(itemToSell);
          let sellMessage = `Sold <color="${itemColor}">[${itemToSell}]</color> for ${await this.currency.format(finalPrice)}`;
          if (barteringMultiplier > 1.0) {
            sellMessage += ` (${barteringMultiplier.toFixed(2)}x bartering bonus!)`;
          }
          sellMessage += `! You now have ${formattedCurrency} and <color="ff0">x${remainingCount}</color> <color="${itemColor}">[${itemToSell}]</color> remaining. Gained ${barteringXP} Bartering XP`;
          
          // Use middlePrint for the selling result
          this.omegga.middlePrint(playerId, sellMessage);
          
          return { 
            success: true, 
            message: sellMessage,
            reward: { 
              type: 'sell', 
              item: itemToSell, 
              basePrice: basePrice,
              finalPrice: finalPrice,
              barteringMultiplier: barteringMultiplier,
              remainingCount, 
              newCurrency: formattedCurrency,
              barteringXpGained: barteringXP,
              barteringSkillLeveledUp: barteringSkillResult.leveledUp,
              newBarteringLevel: barteringSkillResult.newLevel
            }
          };

        default:
          return { success: false, message: "Unknown trigger type!" };
       }
     } catch (error) {
       console.error(`Error processing brick trigger ${triggerId}:`, error);
       const errorMessage = "Error processing trigger!";
       this.omegga.middlePrint(playerId, errorMessage);
       return { success: false, message: errorMessage };
     }
   }

     // Brick interaction methods
  async setBrickPositions(triggerId: string, positions: Array<{ x: number; y: number; z: number }>): Promise<void> {
    const triggers = await this.getBrickTriggers();
    if (triggers[triggerId]) {
      triggers[triggerId].brickPositions = positions;
      triggers[triggerId].triggerType = 'click';
      await this.setBrickTriggers(triggers);
    }
  }

  // Process brick interaction from any event type
  async processBrickInteraction(data: any, eventName: string): Promise<void> {
    try {
      // Extract data from various possible formats
      let player = data.player;
      let position = data.position;
      let brickAsset = data.brick_asset || data.brick;
      
      // If player is not directly available, try to get it from other fields
      if (!player && data.playerId) {
        player = this.omegga.getPlayer(data.playerId);
      }
      if (!player && data.speaker) {
        player = this.omegga.getPlayer(data.speaker);
      }
      if (!player && data.name) {
        player = this.omegga.getPlayer(data.name);
      }
      
      // If position is not directly available, try to get it from other fields
      if (!position && data.pos) {
        position = data.pos;
      }
      if (!position && data.location) {
        position = data.location;
      }
      if (!position && data.coords) {
        position = data.coords;
      }
      
      if (!player || !position) {
        return;
      }
      
      // Convert position to array format if it's not already
      let posArray: number[];
      if (Array.isArray(position)) {
        posArray = position;
      } else if (typeof position === 'object' && position.x !== undefined) {
        posArray = [position.x, position.y, position.z];
      } else {
        return;
      }
      
      const triggers = await this.getBrickTriggers();
      
      // Check for click-based triggers on this brick
      let matchFound = false;
      for (const [triggerId, trigger] of Object.entries(triggers)) {
        if (trigger.triggerType === 'click' && trigger.brickPositions) {
          for (const brickPos of trigger.brickPositions) {
                         if (brickPos.x === posArray[0] && brickPos.y === posArray[1] && brickPos.z === posArray[2]) {
               if (trigger.type === 'sell') {
                 console.log(`[Hoopla RPG] [${player.name}] is selling to shopkeeper: ${triggerId.replace('shopkeeper_', '').split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
               } else if (trigger.type === 'fish') {
                 console.log(`[Hoopla RPG] [${player.name}] is fishing node: ${triggerId.replace('fishing_', '').split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
               } else if (trigger.type === 'item') {
                 console.log(`[Hoopla RPG] [${player.name}] is mining node: ${triggerId.replace('mining_', '').split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
               }
               matchFound = true;
              
              const result = await this.triggerBrickAction(player.id, triggerId);
              
                             if (result.success) {
                 // Success messages are now handled by middlePrint in triggerBrickAction
                 if (trigger.type === 'sell') {
                   console.log(`[Hoopla RPG] [${player.name}] successfully sold resource: ${result.reward?.item || 'unknown'}`);
                 } else {
                   console.log(`[Hoopla RPG] [${player.name}] successfully collected resource: ${result.reward?.item || 'unknown'}`);
                 }
               } else {
                 // Error messages are now handled by middlePrint in triggerBrickAction
               }
              break;
            }
          }
        }
      }
      
      if (!matchFound) {
        // Optional: use middlePrint to inform player that this brick has no triggers
        this.omegga.middlePrint(player.id, `This brick has no RPG triggers set up.`);
      }
      
         } catch (error) {
       console.error(`[Hoopla RPG] Error processing brick interaction from ${eventName}:`, error);
     }
  }

  // Create a mining node from selected bricks
  async createMiningNode(speaker: string, oreType: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

             // Get the player's selected bricks using the in-game selector tool
      let saveData = null;
      
      try {
         // Use getTemplateBoundsData to get ONLY the selected bricks, not the entire world
         // @ts-ignore - Accessing player methods that may not be in the type definition
         saveData = await (this.omegga as any).player.getTemplateBoundsData(speaker);
        
      } catch (error) {
         throw new Error(`Failed to get selected bricks. Please ensure you have selected bricks using the in-game selector tool before running this command.`);
      }
       
               
      
      // Validate that we have the expected data structure
      if (!saveData || !saveData.bricks || !Array.isArray(saveData.bricks) || saveData.bricks.length === 0) {
          throw new Error("No bricks selected! Use the in-game selector tool to select bricks first, then run this command.");
      }
        
        console.log(`[Hoopla RPG] Found ${saveData.bricks.length} selected bricks`);

      // Generate unique ID for the node
      const nodeId = `mining_${oreType}_${Date.now()}`;
      
             // Extract positions from selected bricks
       const positions: Array<{ x: number; y: number; z: number }> = [];
       
                        for (let i = 0; i < saveData.bricks.length; i++) {
           const brick = saveData.bricks[i];
          
          // Handle different possible position formats from the in-game selector tool
          let pos = null;
          
          if (brick.position && Array.isArray(brick.position) && brick.position.length >= 3) {
            // Standard position array [x, y, z]
            pos = {
              x: brick.position[0],
              y: brick.position[1], 
              z: brick.position[2]
            };
           } else if (brick.x !== undefined && brick.y !== undefined && brick.z !== undefined) {
             // Direct x, y, z properties
             pos = {
               x: brick.x,
               y: brick.y,
               z: brick.z
             };
           } else if (brick.pos && Array.isArray(brick.pos) && brick.pos.length >= 3) {
             // Alternative pos array
             pos = {
               x: brick.pos[0],
               y: brick.pos[1],
               z: brick.pos[2]
             };
           } else if (brick.location && Array.isArray(brick.location) && brick.location.length >= 3) {
             // Alternative location array
             pos = {
               x: brick.location[0],
               y: brick.location[1],
               z: brick.location[2]
             };
           }
           
           if (pos) {
             positions.push(pos);
           }
        }
       
       if (positions.length === 0) {
        throw new Error("Could not extract brick positions from selection. The brick data structure may be different than expected. Please try selecting the bricks again.");
      }

      // 🚨 DUPLICATE PREVENTION: Check if any of these positions already have triggers
      const existingTriggers = await this.getBrickTriggers();
      const conflictingTriggers: string[] = [];
      
              
      
      for (const [triggerId, trigger] of Object.entries(existingTriggers)) {
        if (trigger.brickPositions) {
          for (const triggerPos of trigger.brickPositions) {
                         for (const newPos of positions) {
               if (triggerPos.x === newPos.x && triggerPos.y === newPos.y && triggerPos.z === newPos.z) {
                 conflictingTriggers.push(`${triggerId} (${trigger.type} - ${trigger.message})`);
               }
             }
          }
        }
      }
      
      if (conflictingTriggers.length > 0) {
        // Find which specific positions are conflicting
        const conflictingPositions: string[] = [];
        for (const [triggerId, trigger] of Object.entries(existingTriggers)) {
          if (trigger.brickPositions) {
            for (const triggerPos of trigger.brickPositions) {
              for (const newPos of positions) {
                if (triggerPos.x === newPos.x && triggerPos.y === newPos.y && triggerPos.z === newPos.z) {
                  conflictingPositions.push(`[${newPos.x}, ${newPos.y}, ${newPos.z}]`);
                }
              }
            }
          }
        }
        
        const conflictMessage = `Cannot create mining node: ${conflictingTriggers.length} position(s) already have triggers!\n\nConflicting positions: ${[...new Set(conflictingPositions)].join(', ')}\nConflicting triggers:\n${conflictingTriggers.map(t => `• ${t}`).join('\n')}\n\nPlease select different bricks or remove existing triggers first.`;
        throw new Error(conflictMessage);
      }

      // Create the trigger with brick positions
      const trigger: BrickTrigger = {
        id: nodeId,
        type: 'item',
        value: 1,
        cooldown: 60000, // 1 minute cooldown
        lastUsed: {},
        message: oreType,
        triggerType: 'click',
        brickPositions: positions
      };

      // Save the trigger
      await this.createBrickTrigger(nodeId, trigger);
      
      // Notify the player
      this.omegga.whisper(speaker, `<color="0f0">Created ${oreType} mining node!</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Node ID: ${nodeId}</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Type: Mining node (${oreType})</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Cooldown: 60 seconds</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Bricks: ${positions.length} selected</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Click on the selected bricks to mine ${oreType}!</color>`);
      
       } catch (error) {
       console.error(`[Hoopla RPG] Error creating mining node:`, error);
       this.omegga.whisper(speaker, `<color="f00">Failed to create mining node: ${error.message}</color>`);
     }
   }

  async init() {
    // Load the currency plugin
    try {
      await this.currency.loadPlugin();
      console.log("Hoopla RPG: Currency plugin loaded successfully!");
    } catch (error) {
      console.error("Hoopla RPG: Failed to load currency plugin:", error);
      return { registeredCommands: [] };
    }

    // Register basic RPG commands
    this.omegga.on("cmd:rpg", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const rpgData = await this.getPlayerData(player);
      const currency = await this.currency.getCurrency(player.id);
      const formattedCurrency = await this.currency.format(currency);

                   // Ensure all required properties exist with fallbacks
      const safeRpgData = {
        level: rpgData.level ?? 1,
        experience: rpgData.experience ?? 0,
        health: rpgData.health ?? 100,
        maxHealth: rpgData.maxHealth ?? 100,
        inventory: rpgData.inventory ?? [],
        nodesCollected: rpgData.nodesCollected ?? [],
        skills: rpgData.skills ?? {
          mining: { level: 0, experience: 0 },
          bartering: { level: 0, experience: 0 }
        }
      };
      
      // Count items by type for better display
      const itemCounts: { [key: string]: number } = {};
      for (const item of safeRpgData.inventory) {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
      }
      
      // Format inventory display with items in brackets, rarity colors, and yellow count
      let inventoryDisplay = "Empty";
      if (Object.keys(itemCounts).length > 0) {
        inventoryDisplay = Object.entries(itemCounts)
          .map(([item, count]) => {
            const itemColor = this.getResourceColor(item);
            return `<color="ff0">x${count}</color> <color="${itemColor}">[${item}]</color>`;
          })
          .join(", ");
      }
      
      // Get skill progress
      const miningProgress = await this.getSkillProgress({ id: player.id }, 'mining');
      const barteringProgress = await this.getSkillProgress({ id: player.id }, 'bartering');
      const fishingProgress = await this.getSkillProgress({ id: player.id }, 'fishing');
      
      // Calculate XP progress to next level (handle max level case)
      const xpForCurrentLevel = (safeRpgData.level - this.config.startingLevel) * 100;
      const xpForNextLevel = this.getXPForNextLevel(safeRpgData.level);
      const xpInCurrentLevel = safeRpgData.experience - xpForCurrentLevel;
      const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
      
      // Handle max level case to avoid division by zero
      const xpProgress = safeRpgData.level >= 20 ? 100 : 
        Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
      
      // Display main stats with MAX condition for player level
      const playerLevelDisplay = safeRpgData.level >= 20 ? 
        `<color="ff0">Level ${safeRpgData.level} (MAX)</>` : 
        `<color="ff0">Level ${safeRpgData.level}</> | <color="0ff">${xpInCurrentLevel}/${xpNeededForNextLevel} XP (${Math.round(xpProgress)}%)</>`;
      
      this.omegga.whisper(speaker, 
        `${playerLevelDisplay} | <color="f00">${safeRpgData.health}/${safeRpgData.maxHealth} HP</> | <color="0f0">${formattedCurrency}</>`
      );
      
      // Display skills with XP progress (showing XP within current level) and MAX condition
      const miningXPInLevel = this.getXPInCurrentSkillLevel(miningProgress.level, miningProgress.experience);
      const barteringXPInLevel = this.getXPInCurrentSkillLevel(barteringProgress.level, barteringProgress.experience);
      const fishingXPInLevel = this.getXPInCurrentSkillLevel(fishingProgress.level, fishingProgress.experience);
      
      // Create skill displays with MAX condition
      const miningDisplay = miningProgress.level >= 20 ? 
        `<color="0ff">Mining ${miningProgress.level} (MAX)</>` : 
        `<color="0ff">Mining ${miningProgress.level} - ${miningXPInLevel}/${miningProgress.xpForNextLevel}XP (${Math.round(miningProgress.progress)}%)</>`;
      
      const barteringDisplay = barteringProgress.level >= 20 ? 
        `<color="f0f">Bartering ${barteringProgress.level} (MAX)</>` : 
        `<color="f0f">Bartering ${barteringProgress.level} - ${barteringXPInLevel}/${barteringProgress.xpForNextLevel}XP (${Math.round(barteringProgress.progress)}%)</>`;
      
      const fishingDisplay = fishingProgress.level >= 20 ? 
        `<color="0aa">Fishing ${fishingProgress.level} (MAX)</>` : 
        `<color="0aa">Fishing ${fishingProgress.level} - ${fishingXPInLevel}/${fishingProgress.xpForNextLevel}XP (${Math.round(fishingProgress.progress)}%)</>`;
      
      this.omegga.whisper(speaker, `${miningDisplay} | ${barteringDisplay}`);
      this.omegga.whisper(speaker, `${fishingDisplay}`);
      
      // Display inventory
      this.omegga.whisper(speaker, `<color="fff">Inventory: ${inventoryDisplay}</>`);
      
      this.omegga.whisper(speaker, `<color="888">Try /rpghelp for more commands</color>`);
    });

    // RPG initialization command - will eventually handle mining nodes, class selection, shopkeepers, and questgivers
    this.omegga.on("cmd:rpginit", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f0f">Initializing RPG systems...</color>`);

      try {
        // Initialize mining nodes
        this.omegga.whisper(speaker, `<color="0ff">Initializing mining nodes...</color>`);
        await this.autoDetectMiningNodes(speaker);

        // Initialize fishing nodes
        this.omegga.whisper(speaker, `<color="0ff">Initializing fishing nodes...</color>`);
        await this.autoDetectFishingNodes(speaker);

        // Initialize shopkeepers
        this.omegga.whisper(speaker, `<color="0ff">Initializing shopkeepers...</color>`);
        await this.autoDetectShopkeepers(speaker);

                 // Restore status for any mining nodes that have finished their cooldown
         this.omegga.whisper(speaker, `<color="0ff">Restoring mining node status...</color>`);
         await this.restoreAllMiningNodeStatus();

        // TODO: Add class selection brick initialization
        // TODO: Add questgiver initialization

        this.omegga.whisper(speaker, `<color="0f0">RPG systems initialized successfully!</color>`);

        } catch (error) {
         console.error(`[Hoopla RPG] Failed to initialize RPG systems:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to initialize RPG systems: ${error.message}</color>`);
       }
    });

    // RPG help command - shows all available commands
    this.omegga.on("cmd:rpghelp", async (speaker: string) => {
      this.omegga.whisper(speaker, `<color="0ff">=== RPG Commands ===</color>`);
             this.omegga.whisper(speaker, `<color="0ff">/rpg</> - Show your RPG stats and inventory contents`);
       this.omegga.whisper(speaker, `<color="0ff">/rpginit</> - Initialize all RPG systems (mining nodes, class selection, shopkeepers, questgivers)`);
       this.omegga.whisper(speaker, `<color="0ff">/rpghelp</> - Show this help message`);
       this.omegga.whisper(speaker, `<color="0ff">/rpgclearall</> - Clear all initialized RPG nodes and systems`);
       this.omegga.whisper(speaker, `<color="0ff">/mininginfo</> - Show mining requirements and speed progression`);
       this.omegga.whisper(speaker, `<color="0ff">/fishinginfo</> - Show fishing requirements and speed progression`);
       this.omegga.whisper(speaker, `<color="0ff">/rpgfixlevel</> - Fix overleveled status (if you exceeded level 20)`);

              this.omegga.whisper(speaker, `<color="f0f">=== Setup Instructions ===</color>`);
        this.omegga.whisper(speaker, `<color="f0f">1. Set up bricks with Component_Interact and ConsoleTag like 'rpg_mining_iron' or 'rpg_mining_gold'`);
        this.omegga.whisper(speaker, `<color="f0f">2. Set up fishing bricks with ConsoleTag like 'rpg_fishing_spot'`);
        this.omegga.whisper(speaker, `<color="f0f">3. Set up shopkeeper bricks with ConsoleTag like 'rpg_sell_copper' or 'rpg_sell_gup'`);
        this.omegga.whisper(speaker, `<color="f0f">4. Run /rpginit to automatically detect and convert all RPG bricks`);
        this.omegga.whisper(speaker, `<color="f0f">5. Click on the converted bricks to interact with them!`);
        this.omegga.whisper(speaker, `<color="0ff">Note: Mining and fishing nodes use progressive cooldowns and skill-based requirements!</color>`);
        this.omegga.whisper(speaker, `<color="ff0">Copper (any level) | Iron (level 5) | Gold (level 10)</color>`);
        this.omegga.whisper(speaker, `<color="0aa">Fishing: All spots can catch any available fish type based on your level! (5 attempts per spot)</color>`);
    });

    // RPG fix level command - fixes overleveled players
    this.omegga.on("cmd:rpgfixlevel", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Checking for overleveled status...</color>`);
      
      try {
        await this.fixOverleveledPlayer(player.id);
        this.omegga.whisper(speaker, `<color="0f0">Level check complete! Use /rpg to see your current status.</color>`);
      } catch (error) {
        console.error(`[Hoopla RPG] Error fixing overleveled player ${speaker}:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error fixing level status: ${error.message}</color>`);
      }
    });

    // Mining info command - shows mining requirements and speed progression
    this.omegga.on("cmd:mininginfo", async (speaker: string) => {
      this.omegga.whisper(speaker, `<color="0ff">=== Mining Requirements ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Copper: Available at any mining level</color>`);
      this.omegga.whisper(speaker, `<color="ff0">Iron: Requires mining level 5</color>`);
      this.omegga.whisper(speaker, `<color="f00">Gold: Requires mining level 10</color>`);
      
      this.omegga.whisper(speaker, `<color="0ff">=== Mining Speed Progression ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Level 0-4: Copper only (5 clicks)</color>`);
      this.omegga.whisper(speaker, `<color="ff0">Level 5-9: Copper (3 clicks) | Iron (4 clicks)</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Level 10-14: Copper (2 clicks) | Iron (3 clicks) | Gold (4 clicks)</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Level 15-19: Copper (2 clicks) | Iron (2 clicks) | Gold (3 clicks)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Level 20: Copper (1 click) | Iron (1 click) | Gold (2 clicks)</color>`);
      
      this.omegga.whisper(speaker, `<color="0ff">=== Progress Bar Example ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Progress: ${this.createProgressBar(3, 5)}</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Example: [<color="0f0">::::::::::::</color><color="888">--------</color>] (3/5 clicks)</color>`);
    });

    // Fishing info command - shows fishing requirements and speed progression
    this.omegga.on("cmd:fishinginfo", async (speaker: string) => {
      this.omegga.whisper(speaker, `<color="0ff">=== Fishing System ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">All fishing spots can catch any available fish type</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Fish availability is based on your fishing level</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Each fishing spot gives 5 attempts before going on cooldown</color>`);
      
      this.omegga.whisper(speaker, `<color="0ff">=== Fish Types & Rarity ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Gup: Common fish (any level)</color>`);
      this.omegga.whisper(speaker, `<color="ff0">Cod: Uncommon fish (level 5+)</color>`);
      this.omegga.whisper(speaker, `<color="f00">Shark: Rare fish (level 10+)</color>`);
      
      this.omegga.whisper(speaker, `<color="0ff">=== Fishing Speed Progression ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Level 0-4: 5 clicks</color>`);
      this.omegga.whisper(speaker, `<color="ff0">Level 5-9: 3 clicks</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Level 10-14: 2 clicks</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Level 15-19: 2 clicks</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Level 20: 1 click</color>`);
      
      this.omegga.whisper(speaker, `<color="0ff">=== Progress Bar Example ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Progress: ${this.createProgressBar(3, 5)}</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Example: [<color="0f0">::::::::::::</color><color="888">--------</color>] (3/5 clicks)</color>`);
      
      this.omegga.whisper(speaker, `<color="0ff">=== Fish Catch Rates ===</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Level 0-4: 70% Gup, 25% Cod, 5% Shark</color>`);
      this.omegga.whisper(speaker, `<color="ff0">Level 5-9: 65% Gup, 30% Cod, 5% Shark</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Level 10-14: 60% Gup, 30% Cod, 10% Shark</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Level 15-19: 50% Gup, 35% Cod, 15% Shark</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Level 20: 50% Gup, 35% Cod, 15% Shark</color>`);
    });

         

      

    

     // Command to clear all RPG systems (for testing/resetting)
     this.omegga.on("cmd:rpgclearall", async (speaker: string) => {
              console.log(`[Hoopla RPG] RPG clear all command received from ${speaker}`);
      
      try {
        const triggers = await this.getBrickTriggers();
        const triggerCount = Object.keys(triggers).length;
        
        if (triggerCount === 0) {
          this.omegga.whisper(speaker, `<color="f0f">No RPG systems to clear!</color>`);
           return;
         }

        // Clear all triggers
        await this.setBrickTriggers({});
        
        console.log(`[Hoopla RPG] Cleared all ${triggerCount} RPG systems`);
        this.omegga.whisper(speaker, `<color="0f0">Cleared all ${triggerCount} RPG systems! You now have a clean slate.</color>`);
        
       } catch (error) {
         console.error(`[Hoopla RPG] Error clearing all RPG systems:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to clear RPG systems: ${error.message}</>`);
       }
    });





    // Brick interaction event handler - using the 'interact' event from Omegga
    this.omegga.on("interact", async (data: any) => {
      try {
        // Extract data according to Omegga documentation structure
        const { player, position, brick_asset } = data;
        
        if (!player || !position) {
          return;
        }

        const triggers = await this.getBrickTriggers();
        
        // Check for click-based triggers on this brick
        let matchFound = false;
        for (const [triggerId, trigger] of Object.entries(triggers)) {
          if (trigger.triggerType === 'click' && trigger.brickPositions) {
            for (const brickPos of trigger.brickPositions) {
                             // Position is an array [x, y, z] according to Omegga docs
               if (brickPos.x === position[0] && brickPos.y === position[1] && brickPos.z === position[2]) {
                 if (trigger.type === 'sell') {
                   console.log(`[Hoopla RPG] [${player.name}] is selling to shopkeeper: ${triggerId.replace('shopkeeper_', '').split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
                 } else if (trigger.type === 'fish') {
                   console.log(`[Hoopla RPG] [${player.name}] is fishing node: ${triggerId.replace('fishing_', '').split('_')[0]}_${triggerId.split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
                 } else if (trigger.type === 'item') {
                   console.log(`[Hoopla RPG] [${player.name}] is mining node: ${triggerId.replace('mining_', '').split('_')[0]}_${triggerId.split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
                 }
                 matchFound = true;
                 
                 const result = await this.triggerBrickAction(player.id, triggerId);
                 
                 if (result.success) {
                   // Success messages are now handled by middlePrint in triggerBrickAction
                   if (trigger.type === 'sell') {
                     console.log(`[Hoopla RPG] [${player.name}] successfully sold resource: ${result.reward?.item || 'unknown'}`);
                   } else {
                     console.log(`[Hoopla RPG] [${player.name}] successfully collected resource: ${result.reward?.item || 'unknown'}`);
                   }
                 } else {
                   // Error messages are now handled by middlePrint in triggerBrickAction
                 }
                 break;
               }
            }
          }
        }
        
        if (!matchFound) {
          // Optional: use middlePrint to inform player that this brick has no triggers
          this.omegga.middlePrint(player.id, `This brick has no RPG triggers set up.`);
         }
         
       } catch (error) {
       console.error(`[Hoopla RPG] Error handling brick interaction:`, error);
     }
    });

    // Additional interaction event handlers for different event types (for debugging)
    
    // Try all possible interaction event names that Omegga might use
    const possibleEvents = [
      "brick:interact", "player:interact", "click", "brick", "player:click", 
      "interaction", "brick:click", "player:brick", "brick:player", "select",
      "brick:select", "player:select", "target", "brick:target", "player:target",
      "use", "brick:use", "player:use", "activate", "brick:activate", "player:activate",
      "trigger", "brick:trigger", "player:trigger", "hit", "brick:hit", "player:hit",
      "touch", "brick:touch", "player:touch", "press", "brick:press", "player:press"
    ];
    
    for (const eventName of possibleEvents) {
      this.omegga.on(eventName, async (data: any) => {
        // If this looks like a brick interaction, try to process it
        if (data && (data.player || data.position || data.brick || data.brick_asset)) {
          await this.processBrickInteraction(data, eventName);
        }
      });
    }
    
    // Also try some generic event listeners that might catch everything
    this.omegga.on("*", async (eventName: string, data: any) => {
      if (eventName.includes('interact') || eventName.includes('click') || eventName.includes('brick')) {
        // Silent wildcard event listener
      }
    });
    
    // Try component-based interaction events that Omegga might use
    
    // Listen for component interaction events
    this.omegga.on("component:interact", async (data: any) => {
      await this.processBrickInteraction(data, "component:interact");
    });
    
    // Try the specific component name from your brick
    this.omegga.on("Component_Interact", async (data: any) => {
      await this.processBrickInteraction(data, "Component_Interact");
    });
    
    // Try lowercase version
    this.omegga.on("component_interact", async (data: any) => {
      await this.processBrickInteraction(data, "component_interact");
    });
    
    // Try some other possible component event names
    const componentEvents = [
      "interact:component", "component:click", "component:use", "component:activate",
      "interact:Component_Interact", "Component_Interact:interact", "Component_Interact:click"
    ];
    
    // Listen for Interactable component events (this is what you actually have!)
    this.omegga.on("Interactable", async (data: any) => {
      await this.processBrickInteraction(data, "Interactable");
    });
    
    // Try variations of Interactable events
    const interactableEvents = [
      "interactable", "interactable:interact", "interactable:click", "interactable:use",
      "component:interactable", "interactable:component", "interactable:activate"
    ];
    
    for (const eventName of interactableEvents) {
      this.omegga.on(eventName, async (data: any) => {
        await this.processBrickInteraction(data, eventName);
      });
    }
    
    // Also listen for console tag events (these might be fired when Component_Interact is clicked)
    this.omegga.on("console", async (data: any) => {
      // If this is a console tag from our brick, process it
      if (data && data.tag && data.tag.includes('rpg') || data.tag && data.tag.includes('mining')) {
        await this.processBrickInteraction(data, "console");
      }
    });
    
    for (const eventName of componentEvents) {
      this.omegga.on(eventName, async (data: any) => {
        await this.processBrickInteraction(data, eventName);
      });
    }

                      return { 
          registeredCommands: [
            "rpg", "rpginit", "rpghelp", "rpgclearall", "mininginfo", "fishinginfo"
          ] 
        };
  }

  async stop() {}
}

