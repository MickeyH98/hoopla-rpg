/**
 * Player Service
 * 
 * Handles player lifecycle, data management, and core player operations
 * for the RPG system.
 */

import { OL, PS } from "omegga";

// Type definitions
export type PlayerId = { id: string };

export type ConsumableItem = {
  name: string;
  charges: number;
  maxCharges: number;
};

export type RPGPlayer = { 
  level: number; 
  experience: number; 
  health: number; 
  maxHealth: number;
  inventory: string[];
  consumables: ConsumableItem[];
  nodesCollected: string[];
  unlockedItems: string[]; // Track permanently unlocked items (weapons, etc.)
  username?: string;
  quests: { [questId: string]: any };
  skills: {
    mining: { level: number; experience: number };
    bartering: { level: number; experience: number };
    fishing: { level: number; experience: number };
  };
};

export interface Config {
  startingLevel: number;
  maxLevel: number;
}

/**
 * Service class for managing player data and lifecycle
 */
export class PlayerService {
  private omegga: OL;
  private store: PS<any>;
  private config: Config;
  private level30PlayerCache: Map<string, RPGPlayer> = new Map();
  private playerClickTimes: Map<string, number[]> = new Map();
  private readonly MAX_CLICKS_PER_SECOND = 10;

  constructor(omegga: OL, store: PS<any>, config: Config) {
    this.omegga = omegga;
    this.store = store;
    this.config = config;
  }

  /**
   * Creates a default player object with initial values
   * 
   * @returns Default RPGPlayer object
   */
  defaultPlayer(): RPGPlayer {
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
        fishing: { level: 0, experience: 0 }
      }
    };
  }

  /**
   * Clears the cache for a specific player (useful for debugging)
   * 
   * @param playerId - The ID of the player to clear cache for
   */
  clearPlayerCache(playerId: string): void {
    this.level30PlayerCache.delete(playerId);
    console.log(`[Hoopla RPG] DEBUG: Cleared cache for player ${playerId}`);
  }

  /**
   * Checks if a player can perform a click action (debounce system)
   * 
   * @param playerId - The ID of the player to check
   * @returns True if the player can click, false if rate limited
   */
  canPlayerClick(playerId: string): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Get or create click times array for this player
    let clickTimes = this.playerClickTimes.get(playerId) || [];
    
    // Remove clicks older than 1 second
    clickTimes = clickTimes.filter(time => time > oneSecondAgo);
    
    // Add current click time
    clickTimes.push(now);
    this.playerClickTimes.set(playerId, clickTimes);
    
    // Check if player has exceeded the click limit
    if (clickTimes.length >= this.MAX_CLICKS_PER_SECOND) {
      return false;
    }
    
    return true;
  }

  /**
   * Retrieves player data from storage or cache
   * 
   * @param playerId - The ID of the player to retrieve data for
   * @returns Promise resolving to the player's RPG data
   */
  async getPlayerData({ id }: PlayerId): Promise<RPGPlayer> {
    console.log(`[Hoopla RPG] getPlayerData called for player ${id}`);
    
    // Check if this is a level 30 player in our cache
    if (this.level30PlayerCache.has(id)) {
      const cachedPlayer = this.level30PlayerCache.get(id)!;
      console.log(`[DEBUG] Player ${id} data loaded from LEVEL 30 CACHE:`, {
        level: cachedPlayer.level,
        hasSkills: !!cachedPlayer.skills,
        skills: cachedPlayer.skills
      });
      return cachedPlayer;
    }

    const player = (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
    console.log(`[DEBUG] Player ${id} data loaded from store:`, {
      level: player.level,
      hasQuests: !!player.quests,
      questCount: player.quests ? Object.keys(player.quests).length : 0,
      questKeys: player.quests ? Object.keys(player.quests) : [],
      hasSkills: !!player.skills,
      skills: player.skills
    });
    
    // EMERGENCY FIX: Force add skills if missing
    if (!player.skills) {
      console.log(`[Hoopla RPG] EMERGENCY FIX: Player ${id} missing skills data, adding default skills`);
      player.skills = {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      };
      // Save immediately
      await this.store.set("rpg_" + id, player);
    }
    
    // CRITICAL: Validate and fix player data to prevent corruption
    const validatedPlayer = this.validateAndFixPlayerData(player, id);
    
    // Debug logging for validated player data
    console.log(`[DEBUG] Player ${id} validated data:`, {
      level: validatedPlayer.level,
      hasSkills: !!validatedPlayer.skills,
      skills: validatedPlayer.skills
    });
    
    // If this player is level 30, cache them to prevent data corruption
    if (validatedPlayer.level === 30) {
      console.log(`[DEBUG] Caching level 30 player ${id} to prevent data corruption`);
      this.level30PlayerCache.set(id, { ...validatedPlayer });
    }
    
    return validatedPlayer;
  }

  /**
   * Saves player data to storage
   * 
   * @param playerId - The ID of the player to save data for
   * @param data - The player data to save
   */
  async setPlayerData({ id }: PlayerId, data: RPGPlayer): Promise<void> {
    console.log(`[DEBUG] PlayerService.setPlayerData called for player: ${id}`);
    console.log(`[DEBUG] Saving player data:`, {
      level: data.level,
      hasQuests: !!data.quests,
      questCount: data.quests ? Object.keys(data.quests).length : 0,
      questKeys: data.quests ? Object.keys(data.quests) : []
    });
    
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
    console.log(`[DEBUG] Player data saved successfully for: ${id}`);
    
    // Add player ID to the list of all players
    await this.addPlayerToList(id);
  }

  /**
   * Updates player data with partial data
   * 
   * @param playerId - The ID of the player to update
   * @param data - Partial player data to update
   */
  async updatePlayerData({ id }: PlayerId, data: Partial<RPGPlayer>): Promise<void> {
    const baseData = (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
    
    // Ensure levels don't exceed max level
    const safeData = { ...data };
    if (safeData.level !== undefined) {
      safeData.level = Math.min(safeData.level, 30);
    }
    if (safeData.skills) {
      if (safeData.skills.mining?.level !== undefined) {
        safeData.skills.mining.level = Math.min(safeData.skills.mining.level, 30);
      }
      if (safeData.skills.bartering?.level !== undefined) {
        safeData.skills.bartering.level = Math.min(safeData.skills.bartering.level, 30);
      }
      if (safeData.skills.fishing?.level !== undefined) {
        safeData.skills.fishing.level = Math.min(safeData.skills.fishing.level, 30);
      }
    }
    
    const updatedData = { ...baseData, ...safeData };
    
    // If this player is level 30, cache them to prevent data corruption
    if (updatedData.level === 30) {
      this.level30PlayerCache.set(id, { ...updatedData });
    }
    
    await this.store.set("rpg_" + id, updatedData);
  }

  /**
   * Adds a player ID to the list of all players
   * 
   * @param playerId - The ID of the player to add
   */
  async addPlayerToList(playerId: string): Promise<void> {
    const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
    
    if (!allPlayerIds.includes(playerId)) {
      allPlayerIds.push(playerId);
      await this.store.set("all_player_ids", allPlayerIds as any);
    }
  }

  /**
   * Ensures a player's username is stored in the database
   * 
   * @param playerId - The ID of the player
   * @param username - The username to store
   */
  async ensurePlayerUsername(playerId: string, username: string): Promise<void> {
    const player = await this.getPlayerData({ id: playerId });
    if (!player.username || player.username !== username) {
      player.username = username;
      await this.setPlayerData({ id: playerId }, player);
    }
  }

  /**
   * Fixes a player who exceeded level 30 (data corruption fix)
   * 
   * @param playerId - The ID of the player to fix
   */
  async fixOverleveledPlayer(playerId: string): Promise<void> {
    try {
      const player = await this.getPlayerData({ id: playerId });
      let needsFix = false;
      
      // Check main level
      if (player.level > 30) {
        console.log(`[Hoopla RPG] Fixing overleveled player ${playerId}: ${player.level} → 30`);
        player.level = 30;
        needsFix = true;
      }
      
      // Check skill levels
      if (player.skills) {
        if (player.skills.mining?.level > 30) {
          console.log(`[Hoopla RPG] Fixing overleveled mining skill for player ${playerId}: ${player.skills.mining.level} → 30`);
          player.skills.mining.level = 30;
          needsFix = true;
        }
        if (player.skills.bartering?.level > 30) {
          console.log(`[Hoopla RPG] Fixing overleveled bartering skill for player ${playerId}: ${player.skills.bartering.level} → 30`);
          player.skills.bartering.level = 30;
          needsFix = true;
        }
        if (player.skills.fishing?.level > 30) {
          console.log(`[Hoopla RPG] Fixing overleveled fishing skill for player ${playerId}: ${player.skills.fishing.level} → 30`);
          player.skills.fishing.level = 30;
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
      console.log(`[Hoopla RPG] Error fixing overleveled player ${playerId}:`, error);
    }
  }

  /**
   * Heals a player by the specified amount
   * 
   * @param playerId - The ID of the player to heal
   * @param amount - The amount of health to restore
   * @returns Object containing new health and amount healed
   */
  async healPlayer({ id }: PlayerId, amount: number): Promise<{ newHealth: number; healed: number }> {
    const player = await this.getPlayerData({ id });
    const oldHealth = player.health;
    const newHealth = Math.min(player.maxHealth, player.health + amount);
    const healed = newHealth - oldHealth;
    
    player.health = newHealth;
    await this.setPlayerData({ id }, player);
    
    return { newHealth, healed };
  }

  /**
   * Validates and fixes player data to prevent corruption during plugin reloads
   * 
   * @param player - The player data to validate
   * @param playerId - The player ID for logging
   * @returns Validated and fixed player data
   */
  private validateAndFixPlayerData(player: RPGPlayer, playerId: string): RPGPlayer {
    const fixedPlayer = { ...player };
    let needsFix = false;
    
    // Validate and fix main level
    if (typeof fixedPlayer.level !== 'number' || fixedPlayer.level < 1) {
      console.log(`[Hoopla RPG] WARNING: Invalid level for player ${playerId}: ${fixedPlayer.level}, resetting to ${this.config.startingLevel}`);
      fixedPlayer.level = this.config.startingLevel;
      needsFix = true;
    }
    
    // Validate and fix experience
    if (typeof fixedPlayer.experience !== 'number' || fixedPlayer.experience < 0) {
      console.log(`[Hoopla RPG] WARNING: Invalid experience for player ${playerId}: ${fixedPlayer.experience}, resetting to 0`);
      fixedPlayer.experience = 0;
      needsFix = true;
    }
    
    // Validate and fix health
    if (typeof fixedPlayer.health !== 'number' || fixedPlayer.health < 0) {
      console.log(`[Hoopla RPG] WARNING: Invalid health for player ${playerId}: ${fixedPlayer.health}, resetting to 100`);
      fixedPlayer.health = 100;
      needsFix = true;
    }
    
    if (typeof fixedPlayer.maxHealth !== 'number' || fixedPlayer.maxHealth < 1) {
      console.log(`[Hoopla RPG] WARNING: Invalid maxHealth for player ${playerId}: ${fixedPlayer.maxHealth}, resetting to 100`);
      fixedPlayer.maxHealth = 100;
      needsFix = true;
    }
    
    // Validate and fix inventory
    if (!Array.isArray(fixedPlayer.inventory)) {
      console.log(`[Hoopla RPG] WARNING: Invalid inventory for player ${playerId}, resetting to empty array`);
      fixedPlayer.inventory = [];
      needsFix = true;
    }
    
    // Validate and fix unlockedItems
    if (!Array.isArray(fixedPlayer.unlockedItems)) {
      console.log(`[Hoopla RPG] WARNING: Invalid unlockedItems for player ${playerId}, resetting to empty array`);
      fixedPlayer.unlockedItems = [];
      needsFix = true;
    }
    
    // Validate and fix skills
    if (!fixedPlayer.skills || typeof fixedPlayer.skills !== 'object') {
      console.log(`[Hoopla RPG] WARNING: Invalid skills for player ${playerId}, resetting to default`);
      fixedPlayer.skills = {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      };
      needsFix = true;
    } else {
      // Validate individual skills
      const skillTypes = ['mining', 'bartering', 'fishing'] as const;
      for (const skillType of skillTypes) {
        if (!fixedPlayer.skills[skillType] || 
            typeof fixedPlayer.skills[skillType].level !== 'number' || 
            typeof fixedPlayer.skills[skillType].experience !== 'number') {
          console.log(`[Hoopla RPG] WARNING: Invalid ${skillType} skill for player ${playerId}, resetting to default`);
          fixedPlayer.skills[skillType] = { level: 0, experience: 0 };
          needsFix = true;
        }
      }
    }
    
    // Validate and fix quests
    if (!fixedPlayer.quests || typeof fixedPlayer.quests !== 'object') {
      console.log(`[Hoopla RPG] WARNING: Invalid quests for player ${playerId}, resetting to empty object`);
      fixedPlayer.quests = {};
      needsFix = true;
    }
    
    // Log if any fixes were applied
    if (needsFix) {
      console.log(`[Hoopla RPG] Applied data validation fixes for player ${playerId}`);
    }
    
    return fixedPlayer;
  }

  /**
   * Gets the current working directory (for debugging)
   * 
   * @returns Current working directory path
   */
  getCurrentWorkingDirectory(): string {
    return process.cwd();
  }
}
