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
type ConsumableItem = {
  name: string;
  charges: number;
  maxCharges: number;
};

type RPGPlayer = { 
  level: number; 
  experience: number; 
  health: number; 
  maxHealth: number;
  inventory: string[];
  consumables: ConsumableItem[]; // Track consumable items with charges
  nodesCollected: string[]; // Track which nodes the player has discovered
  username?: string; // Store player's username for leaderboard display
  skills: {
    mining: { level: number; experience: number };
    bartering: { level: number; experience: number };
    fishing: { level: number; experience: number };
  };
};

type BrickTrigger = {
  id: string;
  type: 'xp' | 'currency' | 'item' | 'heal' | 'sell' | 'fish' | 'bulk_sell' | 'buy';
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
  // Node cooldown tracking (30 seconds after depletion)
  nodeCooldown?: { [playerId: string]: number };
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
      consumables: [],
      nodesCollected: [],
      username: undefined, // Will be set when player first interacts
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

  // Ensure player username is stored in database
  async ensurePlayerUsername(playerId: string, username: string): Promise<void> {
    const player = await this.getPlayerData({ id: playerId });
    if (!player.username || player.username !== username) {
      player.username = username;
      await this.setPlayerData({ id: playerId }, player);
    }
  }

  // Initialize a single RPG node based on interaction
  async initializeRPGNode(player: any, nodeData: { type: string; subtype: string; position: number[]; consoleTag: string; lastUsed: number }): Promise<boolean> {
    try {
      const { type, subtype, position, consoleTag } = nodeData;
      const nodeKey = `${position[0]},${position[1]},${position[2]}`;
      
      // Check if this node already has a trigger
      const existingTriggers = await this.getBrickTriggers();
      const existingTrigger = Object.values(existingTriggers).find(trigger => 
        trigger.brickPositions && trigger.brickPositions.some(pos => 
          pos.x === position[0] && pos.y === position[1] && pos.z === position[2]
        )
      );
      
      if (existingTrigger) {
        return false; // No new trigger created
      }
      
      // Create appropriate trigger based on node type
      const triggerId = `rpg_${type}_${subtype}_${nodeKey}`;
      let trigger: BrickTrigger;
      
      switch (type) {
        case 'mining':
          trigger = {
            id: triggerId,
            type: 'item',
            value: 1,
            cooldown: 5000,
            lastUsed: {},
            message: `Mining ${subtype}...`,
            color: '#FFD700',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click',
            miningProgress: {}
          };
          break;
          
        case 'fishing':
          trigger = {
            id: triggerId,
            type: 'fish',
            value: 1,
            cooldown: 3000,
            lastUsed: {},
            message: `Fishing for ${subtype}...`,
            color: '#00BFFF',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click',
            fishingProgress: {},
            fishingAttemptsRemaining: {}
          };
          break;
          
        case 'sell':
        case 'buy':
          // Set appropriate price based on item type
          let itemPrice = 1;
          if (type === 'buy') {
            if (consoleTag.includes('bait')) {
              itemPrice = 100; // Fish bait costs 100 currency for 20 pieces
            } else if (consoleTag.includes('pickaxe')) {
              itemPrice = 100; // Pickaxe costs 100 currency
            } else {
              itemPrice = 25; // Default price for other items
            }
          }
          
          trigger = {
            id: triggerId,
            type: type === 'sell' ? 'sell' : 'buy',
            value: itemPrice,
            cooldown: 1000,
            lastUsed: {},
            message: `Shopkeeper: ${consoleTag}`,
            color: '#FFA500',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click'
          };
          break;
          
        default:
          return false; // No trigger created
      }
      
      // Create the trigger
      await this.createBrickTrigger(triggerId, trigger);
      return true; // New trigger created
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error initializing RPG node:`, error);
      return false; // No trigger created due to error
    }
  }

  // Initialize the interaction-based RPG system
  async initializeRPGOnInteraction(): Promise<void> {
    // Set up interaction listeners for RPG nodes
    this.omegga.on("interact", async (data: any) => {
      try {
        // Handle both old format (string) and new format (object) for player data
        const playerId = typeof data.player === 'string' ? data.player : data.player?.id;
        const playerName = typeof data.player === 'string' ? data.player : data.player?.name;
        
        const player = this.omegga.getPlayer(playerId);
        if (!player) return;

        // Store player username for leaderboard display
        await this.ensurePlayerUsername(player.id, player.name);

        // Check if this is an RPG console tag interaction
        if (data.message || data.tag) {
          const message = data.message || data.tag;
          const rpgMatch = message.match(/^rpg_(mining|fishing|sell|buy)_(.+)$/i);
          if (rpgMatch) {
            const nodeType = rpgMatch[1]; // mining, fishing, sell, buy
            const nodeSubtype = rpgMatch[2]; // iron, gold, spot, etc.
            
            // Store RPG node data by position
            const nodeKey = `${data.position[0]},${data.position[1]},${data.position[2]}`;
            const nodeData = {
              type: nodeType,
              subtype: nodeSubtype,
              position: [data.position[0], data.position[1], data.position[2]],
              consoleTag: message,
              lastUsed: Date.now()
            };
            
            await this.store.set(`rpg_node_${nodeKey}`, nodeData as any);
            
            // Initialize the RPG node if it doesn't exist as a trigger
            const triggerCreated = await this.initializeRPGNode(player, nodeData);
            if (triggerCreated) {
              // If we just created a new trigger, show a message and continue to process it
              let initMessage = "";
              if (nodeData.type === 'fishing') {
                initMessage = `Fishing spot initialized! Click again to start fishing.`;
              } else if (nodeData.type === 'mining') {
                initMessage = `Mining spot initialized! Click again to start mining.`;
              } else if (nodeData.type === 'sell') {
                initMessage = `Shop initialized! Click again to sell items.`;
              } else if (nodeData.type === 'buy') {
                initMessage = `Shop initialized! Click again to buy items.`;
              }
              if (initMessage) {
                this.omegga.middlePrint(player.id, initMessage);
              }
            }
            // Don't return early - continue to process the interaction
          }
        }

        // Process existing triggers
        const triggers = await this.getBrickTriggers();
        let matchFound = false;
        for (const [triggerId, trigger] of Object.entries(triggers)) {
          if (trigger.triggerType === 'click' && trigger.brickPositions) {
            for (const brickPos of trigger.brickPositions) {
              if (brickPos.x === data.position[0] && brickPos.y === data.position[1] && brickPos.z === data.position[2]) {
                matchFound = true;
                const result = await this.triggerBrickAction(player.id, triggerId);
                
                if (result.success) {
                  // Success messages are now handled by middlePrint in triggerBrickAction
                } else {
                  // Error messages are now handled by middlePrint in triggerBrickAction
                }
                break;
              }
            }
          }
          if (matchFound) break;
        }

      } catch (error) {
        console.error(`[Hoopla RPG] Error processing interaction:`, error);
      }
    });
  }

  async setPlayerData({ id }: PlayerId, data: RPGPlayer) {
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
    
    // Add player ID to the list of all players
    await this.addPlayerToList(id);
  }

  async addPlayerToList(playerId: string): Promise<void> {
    const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
    
    if (!allPlayerIds.includes(playerId)) {
      allPlayerIds.push(playerId);
      await this.store.set("all_player_ids", allPlayerIds as any);
    }
  }

  // Fix a specific player who exceeded level 30
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
      console.error(`[Hoopla RPG] Error fixing overleveled player ${playerId}:`, error);
    }
  }

  async updatePlayerData({ id }: PlayerId, data: Partial<RPGPlayer>) {
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
    
    // Always add XP for score tracking, even at max level
    player.experience += amount;
    
    // Calculate new level using proper scaling system
    let newLevel = oldLevel;
    let xpForNextLevel = this.getXPForNextLevel(oldLevel);
    
    // Check if we can level up
    while (xpForNextLevel > 0 && player.experience >= xpForNextLevel && newLevel < 30) {
      newLevel++;
      xpForNextLevel = this.getXPForNextLevel(newLevel);
    }
    
    // Cap at level 30
    newLevel = Math.min(newLevel, 30);
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

  // Calculate XP needed to reach next level with doubled requirements
  getXPForNextLevel(currentLevel: number): number {
    if (currentLevel >= 30) return 0; // Max level reached
    
    // Doubled XP requirements for longer progression
    // Level 1: 200 XP, Level 2: 300 XP, Level 3: 400 XP, etc.
    // Uses a linear progression with doubled base values
    const baseXP = 200; // Doubled from 100
    const levelIncrease = 100; // Doubled from 50
    
    // Calculate total XP needed for next level
    const totalXP = baseXP + (currentLevel * levelIncrease);
    
    return totalXP;
  }

  // Calculate XP progress toward next level with proper scaling
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

  // Get proper item name with rarity color
  getItemDisplayName(itemType: string): string {
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
        // For other items, use title case
        return this.standardizeItemCasing(itemType);
    }
  }

  // Get item name without color tags for inventory storage
  getItemName(itemType: string): string {
    const item = itemType.toLowerCase();
    
    // Map ore types to proper names
    switch (item) {
      case 'copper':
        return 'Copper Ore';
      case 'iron':
        return 'Iron Ore';
      case 'gold':
        return 'Gold Ore';
      case 'diamond':
        return 'Diamond Ore';
      case 'obsidian':
        return 'Obsidian Ore';
      default:
        // For other items, use title case
        return this.standardizeItemCasing(itemType);
    }
  }

  // Get short item name from proper item name (for price lookup)
  getShortItemName(properItemName: string): string {
    const item = properItemName.toLowerCase();
    
    // Map proper names back to short names
    switch (item) {
      case 'copper ore':
        return 'copper';
      case 'iron ore':
        return 'iron';
      case 'gold ore':
        return 'gold';
      case 'diamond ore':
        return 'diamond';
      case 'obsidian ore':
        return 'obsidian';
      default:
        // For other items, return as-is
        return item;
    }
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
      case 'obsidian': return 25;
      case 'diamond': return 50;
      case 'gup': return 2;
      case 'cod': return 5;
      case 'shark': return 15;
      case 'whale': return 40;
      case 'kraken': return 75;
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
      if (resource === 'copper') baseXP = 15;     // Common
      else if (resource === 'iron') baseXP = 25;  // Uncommon
      else if (resource === 'gold') baseXP = 40;  // Rare
      else if (resource === 'obsidian') baseXP = 60; // Epic
      else if (resource === 'diamond') baseXP = 85;  // Legendary
    }
    
    // Fishing resources
    if (skillType === 'fishing') {
      if (resource === 'gup') baseXP = 15;        // Common
      else if (resource === 'cod') baseXP = 25;   // Uncommon
      else if (resource === 'shark') baseXP = 40; // Rare
      else if (resource === 'whale') baseXP = 60; // Epic
      else if (resource === 'kraken') baseXP = 85; // Legendary
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
    
    // Always add XP for score tracking, even at max level
    skill.experience += amount;
    
    // Skill leveling: challenging progressive scaling
    // Each level requires significantly more XP than the previous
    const getSkillXPForNextLevel = (skillLevel: number): number => {
      if (skillLevel >= 30) return 0;
      
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

  // Helper method to safely get world save data with fallback
  private async getWorldSaveDataSafely(): Promise<any> {
    try {
      // First attempt: try to get the full save data
      return await this.omegga.getSaveData();
    } catch (error) {
      console.error(`[Hoopla RPG] Primary save data read failed:`, error);
      
      // Fallback: try to get a smaller subset or use alternative method
      try {
        // If the error is related to array length, the world might be too large
        if (error.message && error.message.includes('Invalid array length')) {
          console.log(`[Hoopla RPG] World appears to be too large for full read. Attempting alternative approach...`);
          
          // For now, return null to indicate we can't read the world
          // In the future, we could implement chunked reading or other strategies
          return null;
        }
      } catch (fallbackError) {
        console.error(`[Hoopla RPG] Fallback save data read also failed:`, fallbackError);
      }
      
      return null;
    }
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
      if (skillLevel >= 30) return 0;
      
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
  // New scaling: 10 clicks at low level → 1 click at max level
  // Each ore tier has different base click requirements
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
    else if (ore === 'obsidian') baseClicks = 12; // Epic - 12 clicks when first unlocked
    else if (ore === 'diamond') baseClicks = 15;  // Legendary - 15 clicks when first unlocked
    
    // Calculate scaling: from baseClicks at unlock level to 1 at level 30
    // Linear scaling from unlock level to level 30
    let unlockLevel = 0;
    if (ore === 'copper') unlockLevel = 0;
    else if (ore === 'iron') unlockLevel = 5;
    else if (ore === 'gold') unlockLevel = 10;
    else if (ore === 'obsidian') unlockLevel = 15;
    else if (ore === 'diamond') unlockLevel = 20;
    
    // Calculate clicks based on level progression
    const levelRange = 30 - unlockLevel; // Levels from unlock to max
    const clickReduction = baseClicks - 1; // Total clicks to reduce (baseClicks → 1)
    const clicksPerLevel = clickReduction / levelRange; // Clicks reduced per level
    
    // Calculate current clicks required
    const levelsProgressed = miningLevel - unlockLevel;
    const currentClicks = Math.max(1, Math.ceil(baseClicks - (levelsProgressed * clicksPerLevel)));
    
    return currentClicks;
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
    
    // Obsidian: Requires mining level 15
    if (ore === 'obsidian' && miningLevel < 15) return false;
    
    // Diamond: Requires mining level 20
    if (ore === 'diamond' && miningLevel < 20) return false;
    
    // Any other ore types are allowed
    return true;
  }

  // Calculate fishing clicks required based on skill level and fish type
  // New scaling: 10 clicks at low level → 1 click at max level
  // Each fish tier has different base click requirements
  getFishingClicksRequired(fishingLevel: number, fishType: string): number {
    // Check if player can catch this fish type
    if (!this.canCatchFishType(fishingLevel, fishType)) {
      return -1; // Cannot catch this fish type
    }
    
    const fish = fishType.toLowerCase();
    
    // Define base click requirements for each fish tier (when first unlocked)
    let baseClicks = 10; // Default base clicks
    
    if (fish === 'gup') baseClicks = 8;      // Common - 8 clicks when first unlocked
    else if (fish === 'cod') baseClicks = 9;   // Uncommon - 9 clicks when first unlocked  
    else if (fish === 'shark') baseClicks = 10;  // Rare - 10 clicks when first unlocked
    else if (fish === 'whale') baseClicks = 12; // Epic - 12 clicks when first unlocked
    else if (fish === 'kraken') baseClicks = 15;  // Legendary - 15 clicks when first unlocked
    
    // Calculate scaling: from baseClicks at unlock level to 1 at level 30
    // Linear scaling from unlock level to level 30
    let unlockLevel = 0;
    if (fish === 'gup') unlockLevel = 0;
    else if (fish === 'cod') unlockLevel = 5;
    else if (fish === 'shark') unlockLevel = 10;
    else if (fish === 'whale') unlockLevel = 15;
    else if (fish === 'kraken') unlockLevel = 20;
    
    // Calculate clicks based on level progression
    const levelRange = 30 - unlockLevel; // Levels from unlock to max
    const clickReduction = baseClicks - 1; // Total clicks to reduce (baseClicks → 1)
    const clicksPerLevel = clickReduction / levelRange; // Clicks reduced per level
    
    // Calculate current clicks required
    const levelsProgressed = fishingLevel - unlockLevel;
    const currentClicks = Math.max(1, Math.ceil(baseClicks - (levelsProgressed * clicksPerLevel)));
    
    return currentClicks;
  }

  // Check if a node is on cooldown for a specific player (30 seconds after depletion)
  isNodeOnCooldown(trigger: BrickTrigger, playerId: string): boolean {
    if (!trigger.nodeCooldown || !trigger.nodeCooldown[playerId]) {
      return false; // No cooldown set
    }
    
    const cooldownEndTime = trigger.nodeCooldown[playerId];
    const currentTime = Date.now();
    
    return currentTime < cooldownEndTime;
  }

  // Set node cooldown for a specific player (30 seconds)
  setNodeCooldown(trigger: BrickTrigger, playerId: string): void {
    if (!trigger.nodeCooldown) {
      trigger.nodeCooldown = {};
    }
    
    const cooldownDuration = 30 * 1000; // 30 seconds in milliseconds
    trigger.nodeCooldown[playerId] = Date.now() + cooldownDuration;
  }

  // Get remaining cooldown time in seconds
  getNodeCooldownRemaining(trigger: BrickTrigger, playerId: string): number {
    if (!trigger.nodeCooldown || !trigger.nodeCooldown[playerId]) {
      return 0; // No cooldown
    }
    
    const cooldownEndTime = trigger.nodeCooldown[playerId];
    const currentTime = Date.now();
    const remainingMs = cooldownEndTime - currentTime;
    
    return Math.max(0, Math.ceil(remainingMs / 1000)); // Convert to seconds
  }

  // Calculate fishing failure chance based on fishing level
  getFishingFailureChance(fishingLevel: number): number {
    // Start at 50% failure at level 0, scale down to 2% at level 30
    const baseFailureRate = 0.50; // 50% at level 0
    const minFailureRate = 0.02;  // 2% at level 30
    const failureReduction = (baseFailureRate - minFailureRate) / 30; // Reduce by 1.6% per level
    
    return Math.max(minFailureRate, baseFailureRate - (fishingLevel * failureReduction));
  }

  // Determine what fish type to catch based on fishing level and RNG
  getRandomFishType(fishingLevel: number, guaranteedCatch: boolean = false): { fishType: string; rarity: string } | null {
    // Calculate failure chance (skip if using bait for guaranteed catch)
    if (!guaranteedCatch) {
      const failureChance = this.getFishingFailureChance(fishingLevel);
      if (Math.random() < failureChance) {
        return null; // Failed to catch anything
      }
    }
    
    // Fish rarity distribution based on fishing level
    let gupChance = 0.70;    // Base chance for Gup (70%)
    let codChance = 0.25;    // Base chance for Cod (25%)
    let sharkChance = 0.05;  // Base chance for Shark (5%)
    let whaleChance = 0.0;   // Base chance for Whale (0%)
    let krakenChance = 0.0;  // Base chance for Kraken (0%)
    
    // Adjust chances based on fishing level
    if (fishingLevel >= 25) {
      // Very high level: Best chances for legendary fish
      gupChance = 0.30;     // 30% Gup
      codChance = 0.30;     // 30% Cod
      sharkChance = 0.25;   // 25% Shark
      whaleChance = 0.10;   // 10% Whale
      krakenChance = 0.05;  // 5% Kraken
    } else if (fishingLevel >= 20) {
      // High level: Good chances for epic and legendary fish
      gupChance = 0.35;     // 35% Gup
      codChance = 0.30;     // 30% Cod
      sharkChance = 0.25;   // 25% Shark
      whaleChance = 0.08;   // 8% Whale
      krakenChance = 0.02;  // 2% Kraken
    } else if (fishingLevel >= 15) {
      // Mid-high level: Better chances for rare fish
      gupChance = 0.45;     // 45% Gup
      codChance = 0.35;     // 35% Cod
      sharkChance = 0.18;   // 18% Shark
      whaleChance = 0.02;   // 2% Whale
      krakenChance = 0.0;   // 0% Kraken
    } else if (fishingLevel >= 10) {
      // Mid level: Improved chances
      gupChance = 0.55;     // 55% Gup
      codChance = 0.30;     // 30% Cod
      sharkChance = 0.15;   // 15% Shark
      whaleChance = 0.0;    // 0% Whale
      krakenChance = 0.0;   // 0% Kraken
    } else if (fishingLevel >= 5) {
      // Low level: Slight improvement
      gupChance = 0.65;     // 65% Gup
      codChance = 0.30;     // 30% Cod
      sharkChance = 0.05;   // 5% Shark
      whaleChance = 0.0;    // 0% Whale
      krakenChance = 0.0;   // 0% Kraken
    }
    // Level 0-4: Use base chances
    
    // Generate random number and determine fish type
    const roll = Math.random();
    
    if (roll < gupChance) {
      return { fishType: 'Gup', rarity: 'Common' };
    } else if (roll < gupChance + codChance) {
      return { fishType: 'Cod', rarity: 'Uncommon' };
    } else if (roll < gupChance + codChance + sharkChance) {
      return { fishType: 'Shark', rarity: 'Rare' };
    } else if (roll < gupChance + codChance + sharkChance + whaleChance) {
      return { fishType: 'Whale', rarity: 'Epic' };
    } else {
      return { fishType: 'Kraken', rarity: 'Legendary' };
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
    
    // Whale: Requires fishing level 15
    if (fish === 'whale' && fishingLevel < 15) return false;
    
    // Kraken: Requires fishing level 20
    if (fish === 'kraken' && fishingLevel < 20) return false;
    
    // Any other fish types are allowed
    return true;
  }

  // Calculate bartering multiplier based on skill level
  getBarteringMultiplier(barteringLevel: number): number {
    if (barteringLevel >= 30) return 2.5; // Max level = 2.5x
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

  /**
   * RARITY COLOR SYSTEM - DOCUMENTED FOR REFERENCE
   * 
   * MINING RESOURCES (Common → Legendary):
   * - Copper Ore: Common (White)
   * - Iron Ore: Uncommon (Green) 
   * - Gold Ore: Rare (Blue)
   * - Obsidian Ore: Epic (Purple)
   * - Diamond Ore: Legendary (Orange)
   * 
   * FISHING RESOURCES (Common → Legendary):
   * - Gup: Common (White)
   * - Cod: Uncommon (Green)
   * - Shark: Rare (Blue)
   * - Whale: Epic (Purple)
   * - Kraken: Legendary (Orange)
   * 
   * CONSUMABLES: All Common (White)
   * 
   * COLOR CODES:
   * - Common: White (#ffffff)
   * - Uncommon: Green (#00ff00)
   * - Rare: Blue (#0080ff)
   * - Epic: Purple (#8000ff)
   * - Legendary: Orange (#ff8000)
   */
  getResourceColor(resourceName: string): string {
    const resource = resourceName.toLowerCase();
    
    // Mining resources - handle both old and new formats
    if (resource === 'copper' || resource === 'copper ore') return 'fff';     // White (Common)
    if (resource === 'iron' || resource === 'iron ore') return '0f0';         // Green (Uncommon)
    if (resource === 'gold' || resource === 'gold ore') return '08f';         // Blue (Rare)
    if (resource === 'obsidian' || resource === 'obsidian ore') return '80f'; // Purple (Epic)
    if (resource === 'diamond' || resource === 'diamond ore') return 'f80';   // Orange (Legendary)
    
    // Fishing resources
    if (resource === 'gup') return 'fff';    // White (Common)
    if (resource === 'cod') return '0f0';    // Green (Uncommon)
    if (resource === 'shark') return '08f';  // Blue (Rare)
    if (resource === 'whale') return '80f';  // Purple (Epic)
    if (resource === 'kraken') return 'f80'; // Orange (Legendary)
    
    // Consumable items (all common rarity - white)
    if (resource === 'fish bait') return 'fff'; // White (Common)
    
    // Default to white for unknown resources
    return 'fff';
  }

  // Automatically detect and convert all mining nodes in the world
  async autoDetectMiningNodes(speaker: string, saveData?: any): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

            console.log(`[Hoopla RPG] Auto-detecting mining nodes in the world...`);

      // Use provided saveData - no fallback
      let worldData = saveData;
      if (!worldData) {
        console.error(`[Hoopla RPG] Mining method called without world data`);
        this.omegga.whisper(speaker, `<color="f00">Error: No world data provided to mining method</color>`);
        return;
      }

      if (!worldData || !worldData.bricks || !Array.isArray(worldData.bricks) || worldData.bricks.length === 0) {
        throw new Error("No bricks found in the world!");
      }

      console.log(`[Hoopla RPG] Found ${worldData.bricks.length} total bricks in world`);

       

       // Filter to only bricks that have Component_Interact with RPG mining console tags
      const miningBricks: Array<{ brick: any; oreType: string; consoleTag: string }> = [];

      for (const brick of worldData.bricks) {
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
  async autoDetectFishingNodes(speaker: string, saveData?: any): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

      console.log(`[Hoopla RPG] Auto-detecting fishing nodes in the world...`);

      // Use provided saveData - no fallback
      let worldData = saveData;
      if (!worldData) {
        console.error(`[Hoopla RPG] Fishing method called without world data`);
        this.omegga.whisper(speaker, `<color="f00">Error: No world data provided to fishing method</color>`);
        return;
      }

      if (!worldData || !worldData.bricks || !Array.isArray(worldData.bricks) || worldData.bricks.length === 0) {
        throw new Error("No bricks found in the world!");
      }

      console.log(`[Hoopla RPG] Found ${worldData.bricks.length} total bricks in world`);

      // Filter to only bricks that have Component_Interact with RPG fishing console tags
      const fishingBricks: Array<{ brick: any; fishType: string; consoleTag: string }> = [];

      for (const brick of worldData.bricks) {
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
  async autoDetectShopkeepers(speaker: string, saveData?: any): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

      console.log(`[Hoopla RPG] Auto-detecting shopkeeper bricks in the world...`);

      // Use provided saveData - no fallback
      let worldData = saveData;
      if (!worldData) {
        console.error(`[Hoopla RPG] Shopkeeper method called without world data`);
        this.omegga.whisper(speaker, `<color="f00">Error: No world data provided to shopkeeper method</color>`);
        return;
      }

      if (!saveData || !saveData.bricks || !Array.isArray(saveData.bricks) || saveData.bricks.length === 0) {
        throw new Error("No bricks found in the world!");
      }

             console.log(`[Hoopla RPG] Found ${saveData.bricks.length} total bricks in world`);

       

       // Filter to only bricks that have Component_Interact with RPG shopkeeper console tags
      const shopkeeperBricks: Array<{ brick: any; resourceType: string; consoleTag: string }> = [];

      for (const brick of worldData.bricks) {
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
          // Check for bulk vendor bricks
          else if (consoleTag === "rpg_sell_all_fish" || consoleTag === "rpg_sell_all_ores") {
            shopkeeperBricks.push({ brick, resourceType: consoleTag, consoleTag });
            console.log(`[Hoopla RPG] Found bulk vendor brick: ${consoleTag} at [${brick.position.join(', ')}]`);
          }
          // Check for buy triggers
          else if (consoleTag.startsWith("rpg_buy_")) {
            const itemType = consoleTag.replace("rpg_buy_", "");
            shopkeeperBricks.push({ brick, resourceType: consoleTag, consoleTag });
            console.log(`[Hoopla RPG] Found buy trigger brick: ${itemType} at [${brick.position.join(', ')}] with console tag: "${consoleTag}"`);
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
          let sellPrice = 0;
          
          // Handle bulk vendors differently
          if (resourceType === 'rpg_sell_all_fish' || resourceType === 'rpg_sell_all_ores') {
            sellPrice = 0; // Price calculated dynamically
            const trigger: BrickTrigger = {
              id: shopkeeperId,
              type: 'bulk_sell',
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
            console.log(`[Hoopla RPG] Created bulk vendor ${resourceType} at [${position.x}, ${position.y}, ${position.z}]`);
            continue;
          }
          // Handle buy triggers
          else if (consoleTag.startsWith("rpg_buy_")) {
            // For buy triggers, we need to set a price - let's use a default price for now
            // The actual price should be set in the brick's Component_Interact value
            const brickWithComponents = brick as any;
            const buyPrice = brickWithComponents.components.Component_Interact.Value || 100; // Default price of 100
            const trigger: BrickTrigger = {
              id: shopkeeperId,
              type: 'buy',
              value: buyPrice,
              cooldown: 0, // No cooldown for buying
              lastUsed: {},
              message: consoleTag,
              triggerType: 'click',
              brickPositions: [position]
            };
            
            // Save the trigger
            await this.createBrickTrigger(shopkeeperId, trigger);
            convertedCount++;
            console.log(`[Hoopla RPG] Created buy trigger ${consoleTag} at [${position.x}, ${position.y}, ${position.z}] with price ${buyPrice}`);
            continue;
          } else {
            sellPrice = this.getResourceSellPrice(resourceType);
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
          }

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

  // Consumable management functions
  async addConsumable({ id }: PlayerId, name: string, maxCharges: number): Promise<void> {
    const player = await this.getPlayerData({ id });
    // Ensure consumables array exists
    if (!player.consumables) {
      player.consumables = [];
    }
    
    // Check if player already has this consumable
    const existingIndex = player.consumables.findIndex(c => c.name === name);
    if (existingIndex > -1) {
      // Add charges to existing consumable
      player.consumables[existingIndex].charges += maxCharges;
    } else {
      // Add new consumable
      player.consumables.push({
        name: name,
        charges: maxCharges,
        maxCharges: maxCharges
      });
    }
    
    await this.setPlayerData({ id }, player);
  }

  async useConsumable({ id }: PlayerId, name: string): Promise<{ success: boolean; chargesRemaining: number }> {
    const player = await this.getPlayerData({ id });
    // Ensure consumables array exists
    if (!player.consumables) {
      player.consumables = [];
      return { success: false, chargesRemaining: 0 };
    }
    
    const consumableIndex = player.consumables.findIndex(c => c.name === name);
    if (consumableIndex === -1) {
      return { success: false, chargesRemaining: 0 };
    }
    
    const consumable = player.consumables[consumableIndex];
    if (consumable.charges <= 0) {
      return { success: false, chargesRemaining: 0 };
    }
    
    // Use one charge
    consumable.charges--;
    
    // If no charges left, remove the consumable
    if (consumable.charges <= 0) {
      player.consumables.splice(consumableIndex, 1);
    }
    
    await this.setPlayerData({ id }, player);
    return { success: true, chargesRemaining: consumable.charges };
  }

  async getConsumableCharges({ id }: PlayerId, name: string): Promise<number> {
    const player = await this.getPlayerData({ id });
    if (!player.consumables) {
      return 0;
    }
    
    const consumable = player.consumables.find(c => c.name === name);
    return consumable ? consumable.charges : 0;
  }

  // Leaderboard system
  async getPlayerScore(playerId: string): Promise<number> {
    const player = await this.getPlayerData({ id: playerId });
    let totalScore = player.experience || 0;
    
    // Add skill XP to total score
    if (player.skills) {
      totalScore += (player.skills.mining?.experience || 0);
      totalScore += (player.skills.fishing?.experience || 0);
      totalScore += (player.skills.bartering?.experience || 0);
    }
    
    return totalScore;
  }

  async getLeaderboard(): Promise<Array<{ playerId: string; name: string; level: number; score: number }>> {
    const leaderboard: Array<{ playerId: string; name: string; level: number; score: number }> = [];
    
    // Get all player IDs that have ever played
    const allPlayerIds = await this.store.get("all_player_ids") as unknown as string[] || [];
    
    for (const playerId of allPlayerIds) {
      try {
        const playerData = await this.getPlayerData({ id: playerId });
        const score = await this.getPlayerScore(playerId);
        
          // Only include players who have some XP (not just default players)
          if (score > 0) {
            // Get stored player name from database, fallback to online player name, then truncated ID
            const storedPlayerName = playerData.username;
            const onlinePlayer = this.omegga.getPlayer(playerId);
            const playerName = storedPlayerName || onlinePlayer?.name || `Player_${playerId.substring(0, 8)}`;
          
          leaderboard.push({
            playerId,
            name: playerName,
            level: playerData.level || 1,
            score
          });
        }
      } catch (error) {
        console.log(`[Hoopla RPG] Error getting score for player ${playerId}:`, error);
      }
    }
    
    // Sort by score (highest first) and return top 10
    return leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async announceLeaderboard(): Promise<void> {
    try {
      const leaderboard = await this.getLeaderboard();
      
      if (leaderboard.length === 0) {
        return;
      }
      
      // Format leaderboard as a single line message
      const leaderboardEntries = leaderboard.map((entry, index) => {
        const position = index + 1;
        const positionText = position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
        return `${positionText}.${entry.name}(L${entry.level}):${entry.score.toLocaleString()}`;
      }).join(" | ");
      
      const message = `<color="ff0">Top Players: ${leaderboardEntries}</color>`;
      this.omegga.broadcast(message);
      
    } catch (error) {
      console.log(`[Hoopla RPG] Error announcing leaderboard:`, error);
    }
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
    const data = await this.store.get("brick_triggers_data");
    return data && typeof data === 'object' ? (data as any) : {};
  }



  async setBrickTriggers(triggers: { [triggerId: string]: BrickTrigger }) {
    await this.store.set("brick_triggers_data", triggers as any);
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

    // Get player name for logging
    const player = this.omegga.getPlayer(playerId);
    const playerName = player?.name || `Player_${playerId.substring(0, 8)}`;
    
    // Extract node type and name from trigger
    let interactionType: string = trigger.type;
    let nodeName = "unknown";
    
    if (trigger.type === 'item') {
      interactionType = 'mining';
      // Extract ore type from trigger ID (e.g., "rpg_mining_iron_100,50,200" -> "iron")
      const match = triggerId.match(/rpg_mining_([^_]+)_/);
      nodeName = match ? match[1] : 'ore';
    } else if (trigger.type === 'fish') {
      interactionType = 'fishing';
      nodeName = '';
    } else if (trigger.type === 'sell') {
      interactionType = 'selling';
      // Extract resource type from trigger ID
      const match = triggerId.match(/rpg_sell_([^_]+)_/);
      nodeName = match ? match[1] : 'items';
    } else if (trigger.type === 'buy') {
      interactionType = 'buying';
      // Extract item type from trigger message
      const buyType = trigger.message.replace('Shopkeeper: ', '');
      if (buyType.includes('bait')) {
        nodeName = 'fish bait';
      } else if (buyType.includes('pickaxe')) {
        nodeName = 'pickaxe';
      } else {
        nodeName = 'items';
      }
    }
    
    console.log(`[Hoopla RPG] ${playerName} is ${interactionType}${nodeName ? ` ${nodeName}` : ''}`);

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
          // Check if node is on cooldown for this player (30 seconds after depletion)
          if (this.isNodeOnCooldown(trigger, playerId)) {
            const remainingSeconds = this.getNodeCooldownRemaining(trigger, playerId);
            const cooldownMessage = `Node depleted! Try again in ${remainingSeconds} seconds.`;
            this.omegga.middlePrint(playerId, cooldownMessage);
            return { success: false, message: cooldownMessage };
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
          
          
          // Check if mining is complete
          if (currentProgress < clicksRequired) {
            // Update trigger data
            triggers[triggerId] = trigger;
            await this.setBrickTriggers(triggers);
            
            const remainingClicks = clicksRequired - currentProgress;
            const progressBar = this.createProgressBar(currentProgress, clicksRequired);
            
            
            // Use middlePrint for progress updates
            this.omegga.middlePrint(playerId, `Mining ${trigger.message}... ${progressBar}`);
            
            return { 
              success: true, 
              message: `Mining ${trigger.message}... ${progressBar}`,
              reward: { type: 'mining_progress', progress: currentProgress, required: clicksRequired, remaining: remainingClicks }
            };
          }
          
          // Mining complete - add to inventory and grant XP with proper item name
          const extractedOreType = trigger.message.replace('Mining ', '').replace('...', ''); // Extract ore type from "Mining gold..."
          const properItemName = this.getItemName(extractedOreType);
          await this.addToInventory({ id: playerId }, properItemName);
          
          // Calculate XP rewards based on ore rarity and mining skill level
          const generalXP = this.getXPReward(trigger.message, miningLevel, 'mining');
          const miningXP = this.getXPReward(trigger.message, miningLevel, 'mining');
          
          // Grant XP for mining
          const miningXpResult = await this.addExperience({ id: playerId }, generalXP);
          
          // Grant Mining XP
          const miningSkillResult = await this.addSkillExperience({ id: playerId }, 'mining', miningXP);
          
          // Reset mining progress for this player
          trigger.miningProgress[playerId] = 0;
          
          // Set 30-second node cooldown after successful mining
          this.setNodeCooldown(trigger, playerId);
          
          // Update trigger data with cooldown
          triggers[triggerId] = trigger;
          await this.setBrickTriggers(triggers);
          
          // Get updated inventory to show total count
          const updatedPlayer = await this.getPlayerData({ id: playerId });
          const itemCount = updatedPlayer.inventory.filter(item => item === properItemName).length;
          
          // New simplified message format with middlePrint - items in brackets with rarity colors
          const displayName = this.getItemDisplayName(extractedOreType);
          const message = `Mined 1 ${displayName} (<color="ff0">x${itemCount}</color> in bag), Gained ${generalXP}XP and ${miningXP} Mining XP`;
          
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
              item: properItemName, 
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
            // Check if node is on cooldown for this player (30 seconds after depletion)
            if (this.isNodeOnCooldown(trigger, playerId)) {
              const remainingSeconds = this.getNodeCooldownRemaining(trigger, playerId);
              const cooldownMessage = `Fishing spot depleted! Try again in ${remainingSeconds} seconds.`;
              this.omegga.middlePrint(playerId, cooldownMessage);
              return { success: false, message: cooldownMessage };
            }
            
            // Initialize fishing attempts for this player (5 attempts per node)
            if (!trigger.fishingAttemptsRemaining) {
              trigger.fishingAttemptsRemaining = {};
            }
            if (!trigger.fishingAttemptsRemaining[playerId]) {
              trigger.fishingAttemptsRemaining[playerId] = 5;
            }
            
            // Also ensure fishing progress is initialized
            if (!trigger.fishingProgress) {
              trigger.fishingProgress = {};
            }
            if (!trigger.fishingProgress[playerId]) {
              trigger.fishingProgress[playerId] = 0;
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
            }
            
            // Final safety check before returning
            const finalAttemptsLeft = trigger.fishingAttemptsRemaining[playerId];
            
            const progressBar = this.createProgressBar(currentFishingProgress, fishingClicksRequired);
            
            // Use middlePrint for progress updates
            this.omegga.middlePrint(playerId, `Fishing... ${progressBar} - ${finalAttemptsLeft} attempts remaining`);
            
            return { 
              success: true, 
              message: `Fishing... ${progressBar} - ${finalAttemptsLeft} attempts remaining`,
              reward: { type: 'fishing_progress', progress: currentFishingProgress, required: fishingClicksRequired, remaining: remainingClicks, attemptsRemaining: finalAttemptsLeft }
            };
          }
          
                    // Check if player has fish bait and use it
          const fishBaitCharges = await this.getConsumableCharges({ id: playerId }, 'Fish bait');
          let usedBait = false;
          
          if (fishBaitCharges > 0) {
            // Use fish bait for guaranteed catch
            const baitResult = await this.useConsumable({ id: playerId }, 'Fish bait');
            if (baitResult.success) {
              usedBait = true;
            }
          }
          
          // Fishing complete - determine what was caught
          const fishResult = usedBait ? this.getRandomFishType(fishingLevel, true) : this.getRandomFishType(fishingLevel);
          
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
          }
          
          trigger.fishingAttemptsRemaining[playerId]--;
          const attemptsRemaining = trigger.fishingAttemptsRemaining[playerId];
          
          
          if (!fishResult) {
            // Failed to catch anything
            const failureMessage = `The fish got away! Better luck next time. - ${attemptsRemaining} attempts remaining`;
            
            // Check if this was the last attempt
            if (attemptsRemaining <= 0) {
              // Node is depleted - set 30-second cooldown
              this.setNodeCooldown(trigger, playerId);
              
              // Clear attempts remaining for this player
              delete trigger.fishingAttemptsRemaining[playerId];
              
              // Update trigger data
              triggers[triggerId] = trigger;
              await this.setBrickTriggers(triggers);
              
              // Combined message for final attempt: failure + depletion notice (prevents message overlap)
              const combinedFailureMessage = `The fish got away! Better luck next time. - Fishing spot depleted! Come back in 30 seconds.`;
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
          const fishingSkillResult = await this.addSkillExperience({ id: playerId }, 'fishing', fishingXP);
          
          // Check if this was the last attempt
          if (attemptsRemaining <= 0) {
            // Node is depleted - set 30-second cooldown
            this.setNodeCooldown(trigger, playerId);
            
            // Clear attempts remaining for this player
            delete trigger.fishingAttemptsRemaining[playerId];
            
            // Get updated inventory to show total count
            const updatedFishingPlayer = await this.getPlayerData({ id: playerId });
            const fishCount = updatedFishingPlayer.inventory.filter(item => item === fishType).length;
            
            // Combined message for final attempt: fish result + depletion notice (prevents message overlap)
            const fishColor = this.getResourceColor(fishType);
            const baitText = usedBait ? " (with Fish bait)" : "";
            const fishingMessage = `Caught 1 <color="${fishColor}">[${fishType}]</color> (<color="ff0">x${fishCount}</color> in bag), Gained ${generalXP}XP and ${fishingXP} Fishing XP${baitText} - Fishing spot depleted! Come back in 30 seconds.`;
            
            // Use middlePrint for the combined result
            this.omegga.middlePrint(playerId, fishingMessage);
            
            // Announce legendary fish catches to the server
            if (fishType.toLowerCase() === 'kraken') {
              const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
              const fishColor = this.getResourceColor(fishType);
              this.omegga.broadcast(`<color="fff">LEGENDARY CATCH! ${playerName} has caught a <color="${fishColor}">[${fishType}]</color>!</color>`);
            }
            
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
          const baitText = usedBait ? " (with Fish bait)" : "";
          const fishingMessage = `Caught 1 <color="${fishColor}">[${fishType}]</color> (<color="ff0">x${fishCount}</color> in bag), Gained ${generalXP}XP and ${fishingXP} Fishing XP${baitText} - ${attemptsRemaining} attempts remaining`;
          
          // Use middlePrint for the regular result
          this.omegga.middlePrint(playerId, fishingMessage);
          
          // Announce legendary fish catches to the server
          if (fishType.toLowerCase() === 'kraken') {
            const playerName = this.omegga.getPlayer(playerId)?.name || "Unknown Player";
            const fishColor = this.getResourceColor(fishType);
            this.omegga.broadcast(`<color="fff">LEGENDARY CATCH! ${playerName} has caught a <color="${fishColor}">[${fishType}]</color>!</color>`);
          }
          
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
          // Check if this is actually a bulk vendor trigger that was created as a regular sell trigger
          if (trigger.message === 'rpg_sell_all_fish' || trigger.message === 'rpg_sell_all_ores' || 
              trigger.message.toLowerCase().includes('all_fish') || trigger.message.toLowerCase().includes('all_ores')) {
            try {
              // Handle as bulk vendor
              const bulkPlayer = await this.getPlayerData({ id: playerId });
              const bulkType = trigger.message; // 'rpg_sell_all_fish' or 'rpg_sell_all_ores'
            
            // Define which items to sell based on type
            let itemsToSell: string[] = [];
            if (bulkType === 'rpg_sell_all_fish' || bulkType.toLowerCase().includes('all_fish')) {
              itemsToSell = ['gup', 'cod', 'shark', 'whale', 'kraken'];
            } else if (bulkType === 'rpg_sell_all_ores' || bulkType.toLowerCase().includes('all_ores')) {
              itemsToSell = ['Copper Ore', 'Iron Ore', 'Gold Ore', 'Obsidian Ore', 'Diamond Ore'];
            }
            
            // Count items in inventory
            const itemCounts: { [key: string]: number } = {};
            let totalValue = 0;
            let totalItems = 0;
            
            for (const item of itemsToSell) {
              const matchingItems = bulkPlayer.inventory?.filter(invItem => 
                invItem.toLowerCase() === item.toLowerCase()
              ) || [];
              const count = matchingItems.length;
              
              if (count > 0) {
                // Use the actual item name from inventory (with proper capitalization)
                const actualItemName = matchingItems[0];
                itemCounts[actualItemName] = count;
                // Convert proper item name back to short name for price lookup
                const shortName = this.getShortItemName(actualItemName);
                const basePrice = this.getResourceSellPrice(shortName);
                const barteringLevel = bulkPlayer.skills?.bartering?.level || 0;
                const barteringMultiplier = this.getBarteringMultiplier(barteringLevel);
                const finalPrice = Math.floor(basePrice * barteringMultiplier);
                totalValue += finalPrice * count;
                totalItems += count;
              }
            }
            
            if (totalItems === 0) {
              const typeName = (bulkType === 'rpg_sell_all_fish' || bulkType.toLowerCase().includes('all_fish')) ? 'fish' : 'ores';
              const noItemsMessage = `You don't have any ${typeName} to sell!`;
              this.omegga.middlePrint(playerId, noItemsMessage);
              return { 
                success: false, 
                message: noItemsMessage
              };
            }
            
            // Remove all items from inventory
            for (const [item, count] of Object.entries(itemCounts)) {
              for (let i = 0; i < count; i++) {
                await this.removeFromInventory({ id: playerId }, item);
              }
            }
            
            // Add currency
            await this.currency.add(playerId, "currency", totalValue);
            
            // Calculate bartering XP (use average XP for bulk sale)
            const bulkBarteringLevel = bulkPlayer.skills?.bartering?.level || 0;
            const averageXP = Math.floor(totalItems * 20); // Average XP per item
            const bulkBarteringSkillResult = await this.addSkillExperience({ id: playerId }, 'bartering', averageXP);
            
            // Get updated currency
            const bulkNewCurrency = await this.currency.getCurrency(playerId);
            const bulkFormattedCurrency = await this.currency.format(bulkNewCurrency);
            
            // Create detailed sell message
            const typeName = (bulkType === 'rpg_sell_all_fish' || bulkType.toLowerCase().includes('all_fish')) ? 'fish' : 'ores';
            let bulkSellMessage = `Sold all ${typeName} for ${await this.currency.format(totalValue)}! `;
            bulkSellMessage += `Items sold: `;
            
            const itemDetails = Object.entries(itemCounts).map(([item, count]) => {
              const itemColor = this.getResourceColor(item);
              return `<color="ff0">x${count}</color> <color="${itemColor}">[${item}]</color>`;
            }).join(', ');
            
            bulkSellMessage += itemDetails;
            bulkSellMessage += `. You now have ${bulkFormattedCurrency}. Gained ${averageXP} Bartering XP`;
            
            // Use middlePrint for the bulk selling result
            this.omegga.middlePrint(playerId, bulkSellMessage);
            
            return { 
              success: true, 
              message: bulkSellMessage,
              reward: { 
                type: 'bulk_sell', 
                itemsSold: itemCounts,
                totalValue: totalValue,
                totalItems: totalItems,
                newCurrency: bulkFormattedCurrency,
                barteringXpGained: averageXP,
                barteringSkillLeveledUp: bulkBarteringSkillResult.leveledUp,
                newBarteringLevel: bulkBarteringSkillResult.newLevel
              }
            };
            } catch (error) {
              throw error; // Re-throw to let the calling code handle it
            }
          } else {
            // Regular sell logic for individual items
            // Check if player has the resource to sell (case-insensitive)
            const sellPlayer = await this.getPlayerData({ id: playerId });
            
            // Find the item in inventory with case-insensitive matching
            const itemToSell = sellPlayer.inventory?.find(item => 
              item.toLowerCase() === trigger.message.toLowerCase()
            );
            
            if (!sellPlayer.inventory || !itemToSell) {
              const itemType = trigger.message.replace('Shopkeeper: ', ''); // Extract item type from "Shopkeeper: gold"
              const properItemName = this.getItemName(itemType);
              const noItemMessage = `You don't have any ${properItemName} to sell!`;
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
          }

        case 'bulk_sell':
          // Handle bulk selling of all fish or all ores
          const bulkPlayer = await this.getPlayerData({ id: playerId });
          const bulkType = trigger.message; // 'rpg_sell_all_fish' or 'rpg_sell_all_ores'
          
          // Define which items to sell based on type
          let itemsToSell: string[] = [];
          if (bulkType === 'rpg_sell_all_fish') {
            itemsToSell = ['gup', 'cod', 'shark', 'whale', 'kraken'];
          } else if (bulkType === 'rpg_sell_all_ores') {
            itemsToSell = ['copper', 'iron', 'gold', 'obsidian', 'diamond'];
          }
          
          // Count items in inventory
          const itemCounts: { [key: string]: number } = {};
          let totalValue = 0;
          let totalItems = 0;
          
          for (const item of itemsToSell) {
            const count = bulkPlayer.inventory?.filter(invItem => 
              invItem.toLowerCase() === item.toLowerCase()
            ).length || 0;
            
            if (count > 0) {
              itemCounts[item] = count;
              const basePrice = this.getResourceSellPrice(item);
              const barteringLevel = bulkPlayer.skills?.bartering?.level || 0;
              const barteringMultiplier = this.getBarteringMultiplier(barteringLevel);
              const finalPrice = Math.floor(basePrice * barteringMultiplier);
              totalValue += finalPrice * count;
              totalItems += count;
            }
          }
          
          if (totalItems === 0) {
            const typeName = bulkType === 'rpg_sell_all_fish' ? 'fish' : 'ores';
            const noItemsMessage = `You don't have any ${typeName} to sell!`;
            this.omegga.middlePrint(playerId, noItemsMessage);
            return { 
              success: false, 
              message: noItemsMessage
            };
          }
          
          // Remove all items from inventory
          for (const [item, count] of Object.entries(itemCounts)) {
            for (let i = 0; i < count; i++) {
              await this.removeFromInventory({ id: playerId }, item);
            }
          }
          
          // Add currency
          await this.currency.add(playerId, "currency", totalValue);
          
          // Calculate bartering XP (use average XP for bulk sale)
          const bulkBarteringLevel = bulkPlayer.skills?.bartering?.level || 0;
          const averageXP = Math.floor(totalItems * 20); // Average XP per item
          const bulkBarteringSkillResult = await this.addSkillExperience({ id: playerId }, 'bartering', averageXP);
          
          // Get updated currency
          const bulkNewCurrency = await this.currency.getCurrency(playerId);
          const bulkFormattedCurrency = await this.currency.format(bulkNewCurrency);
          
          // Create detailed sell message
          const typeName = bulkType === 'rpg_sell_all_fish' ? 'fish' : 'ores';
          let bulkSellMessage = `Sold all ${typeName} for ${await this.currency.format(totalValue)}! `;
          bulkSellMessage += `Items sold: `;
          
          const itemDetails = Object.entries(itemCounts).map(([item, count]) => {
            const itemColor = this.getResourceColor(item);
            return `<color="ff0">x${count}</color> <color="${itemColor}">[${item}]</color>`;
          }).join(', ');
          
          bulkSellMessage += itemDetails;
          bulkSellMessage += `. You now have ${bulkFormattedCurrency}. Gained ${averageXP} Bartering XP`;
          
          // Use middlePrint for the bulk selling result
          this.omegga.middlePrint(playerId, bulkSellMessage);
          
          return { 
            success: true, 
            message: bulkSellMessage,
            reward: { 
              type: 'bulk_sell', 
              itemsSold: itemCounts,
              totalValue: totalValue,
              totalItems: totalItems,
              newCurrency: bulkFormattedCurrency,
              barteringXpGained: averageXP,
              barteringSkillLeveledUp: bulkBarteringSkillResult.leveledUp,
              newBarteringLevel: bulkBarteringSkillResult.newLevel
            }
          };

        case 'buy':
          // Handle buying consumable items
          const buyPlayer = await this.getPlayerData({ id: playerId });
          // Extract the actual buy type from the message (remove "Shopkeeper: " prefix)
          const buyType = trigger.message.replace('Shopkeeper: ', ''); // 'rpg_buy_bait' or other buy triggers
          
          // Update price if it's the old incorrect price (1)
          let itemPrice = trigger.value;
          if (itemPrice === 1 && buyType.includes('bait')) {
            itemPrice = 100; // Update to correct fish bait price
          }
          
          // Check if player has enough currency
          const currentCurrency = await this.currency.getCurrency(playerId);
          
          if (currentCurrency < itemPrice) {
            const insufficientMessage = `Insufficient funds! You need ${await this.currency.format(itemPrice)} but only have ${await this.currency.format(currentCurrency)}.`;
            this.omegga.middlePrint(playerId, insufficientMessage);
            return { success: false, message: insufficientMessage };
          }
          
          // Deduct currency
          await this.currency.add(playerId, "currency", -itemPrice);
          
          // Add consumable based on type
          if (buyType === 'rpg_buy_bait') {
            await this.addConsumable({ id: playerId }, 'Fish bait', 20);
            const newCurrency = await this.currency.getCurrency(playerId);
            const formattedCurrency = await this.currency.format(newCurrency);
            
            const buyMessage = `Purchased <color="fff">[Fish bait]x20</color> for ${await this.currency.format(itemPrice)}! You now have ${formattedCurrency}.`;
            this.omegga.middlePrint(playerId, buyMessage);
            
            return { 
              success: true, 
              message: buyMessage,
              reward: { 
                type: 'buy', 
                item: 'Fish bait',
                charges: 20,
                price: itemPrice,
                newCurrency: formattedCurrency
              }
            };
          } else {
            const unknownMessage = `Unknown item to buy: ${buyType}`;
            this.omegga.middlePrint(playerId, unknownMessage);
            return { success: false, message: unknownMessage };
          }

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
               matchFound = true;
              
              const result = await this.triggerBrickAction(player.id, triggerId);
              
                             if (result.success) {
                 // Success messages are now handled by middlePrint in triggerBrickAction
                 if (trigger.type === 'sell' && !trigger.message?.includes('all_fish') && !trigger.message?.includes('all_ores')) {
                   console.log(`[Hoopla RPG] [${player.name}] successfully sold resource: ${result.reward?.item || 'unknown'}`);
                 } else if (trigger.type !== 'sell' && trigger.type !== 'bulk_sell') {
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

    // Set up leaderboard announcement timer (every 10 minutes)
    setInterval(async () => {
      await this.announceLeaderboard();
    }, 10 * 60 * 1000); // 10 minutes in milliseconds

    console.log("Hoopla RPG: Leaderboard system initialized - announcements every 10 minutes");

    // Initialize the interaction-based RPG system
    await this.initializeRPGOnInteraction();
    console.log("Hoopla RPG: Interaction-based RPG system initialized");





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
      
      // Count items by type for better display and convert malformed names
      const itemCounts: { [key: string]: number } = {};
      for (const item of safeRpgData.inventory) {
        // Convert malformed item names to proper names
        let properItemName = item;
        if (item === 'Mining gold...') {
          properItemName = 'Gold Ore';
        } else if (item === 'Mining diamond...') {
          properItemName = 'Diamond Ore';
        } else if (item === 'Mining iron...') {
          properItemName = 'Iron Ore';
        } else if (item === 'Mining copper...') {
          properItemName = 'Copper Ore';
        } else if (item === 'Mining obsidian...') {
          properItemName = 'Obsidian Ore';
        } else if (item === 'Obsidian') {
          properItemName = 'Obsidian Ore';
        }
        
        itemCounts[properItemName] = (itemCounts[properItemName] || 0) + 1;
      }
      
      
      // Format inventory display with items in brackets, rarity colors, and count - ultra compact
      let inventoryDisplay = "Empty";
      if (Object.keys(itemCounts).length > 0) {
        inventoryDisplay = Object.entries(itemCounts)
          .map(([item, count]) => {
            const itemColor = this.getResourceColor(item);
            
            // Use shorter names for common items to save space
            let shortName = item;
            if (item === 'Gold Ore') shortName = 'Gold';
            else if (item === 'Iron Ore') shortName = 'Iron';
            else if (item === 'Copper Ore') shortName = 'Copper';
            else if (item === 'Diamond Ore') shortName = 'Diamond';
            else if (item === 'Obsidian Ore') shortName = 'Obsidian';
            
            return `<color="${itemColor}">[${shortName}]</color><color="ff0">x${count}</color>`;
          })
          .join(",");
      }
      
      
      // Format consumables display
      let consumablesDisplay = "None";
      if (rpgData.consumables && rpgData.consumables.length > 0) {
        consumablesDisplay = rpgData.consumables
          .map(consumable => {
            const itemColor = this.getResourceColor(consumable.name);
            return `<color="ff0">x${consumable.charges}</color> <color="${itemColor}">[${consumable.name}]</color>`;
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
      const xpProgress = safeRpgData.level >= 30 ? 100 : 
        Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
      
      // Display main stats with MAX condition for player level
      const playerLevelDisplay = safeRpgData.level >= 30 ? 
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
      const miningDisplay = miningProgress.level >= 30 ? 
        `<color="0ff">Mining ${miningProgress.level} (MAX)</>` : 
        `<color="0ff">Mining ${miningProgress.level} - ${miningXPInLevel}/${miningProgress.xpForNextLevel}XP (${Math.round(miningProgress.progress)}%)</>`;
      
      const barteringDisplay = barteringProgress.level >= 30 ? 
        `<color="f0f">Bartering ${barteringProgress.level} (MAX)</>` : 
        `<color="f0f">Bartering ${barteringProgress.level} - ${barteringXPInLevel}/${barteringProgress.xpForNextLevel}XP (${Math.round(barteringProgress.progress)}%)</>`;
      
      const fishingDisplay = fishingProgress.level >= 30 ? 
        `<color="0aa">Fishing ${fishingProgress.level} (MAX)</>` : 
        `<color="0aa">Fishing ${fishingProgress.level} - ${fishingXPInLevel}/${fishingProgress.xpForNextLevel}XP (${Math.round(fishingProgress.progress)}%)</>`;
      
      this.omegga.whisper(speaker, `${miningDisplay} | ${barteringDisplay}`);
      this.omegga.whisper(speaker, `${fishingDisplay}`);
      
      // Display inventory - split into two lines to avoid character limit
      
      // Sort items by rarity (common to legendary)
      const rarityOrder = {
        'Gup': 1,           // Common (White)
        'Copper Ore': 2,    // Common (White)
        'Iron Ore': 3,      // Uncommon (Green)
        'Cod': 4,           // Uncommon (Green)
        'Gold Ore': 5,      // Rare (Blue)
        'Shark': 6,         // Rare (Blue)
        'Whale': 7,         // Epic (Purple)
        'Obsidian Ore': 8,  // Epic (Purple)
        'Kraken': 9,        // Legendary (Orange)
        'Diamond Ore': 10   // Legendary (Orange)
      };
      
      const items = Object.entries(itemCounts).sort(([itemA], [itemB]) => {
        const rarityA = rarityOrder[itemA] || 999; // Unknown items go to end
        const rarityB = rarityOrder[itemB] || 999;
        return rarityA - rarityB; // Sort by rarity order (common first, legendary last)
      });
      
      const midPoint = Math.ceil(items.length / 2);
      const firstHalf = items.slice(0, midPoint);
      const secondHalf = items.slice(midPoint);
      
      // Format first line
      const firstLine = firstHalf
        .map(([item, count]) => {
          const itemColor = this.getResourceColor(item);
          let shortName = item;
          if (item === 'Gold Ore') shortName = 'Gold';
          else if (item === 'Iron Ore') shortName = 'Iron';
          else if (item === 'Copper Ore') shortName = 'Copper';
          else if (item === 'Diamond Ore') shortName = 'Diamond';
          else if (item === 'Obsidian Ore') shortName = 'Obsidian';
          return `<color="${itemColor}">[${shortName}]</color><color="ff0">x${count}</color>`;
        })
        .join(",");
      
      // Format second line
      const secondLine = secondHalf
        .map(([item, count]) => {
          const itemColor = this.getResourceColor(item);
          let shortName = item;
          if (item === 'Gold Ore') shortName = 'Gold';
          else if (item === 'Iron Ore') shortName = 'Iron';
          else if (item === 'Copper Ore') shortName = 'Copper';
          else if (item === 'Diamond Ore') shortName = 'Diamond';
          else if (item === 'Obsidian Ore') shortName = 'Obsidian';
          return `<color="${itemColor}">[${shortName}]</color><color="ff0">x${count}</color>`;
        })
        .join(",");
      
      // Send inventory display
      this.omegga.whisper(speaker, `<color="fff">Inventory: ${firstLine}</>`);
      if (secondLine) {
        this.omegga.whisper(speaker, `<color="fff">  ${secondLine}</>`);
      }
      
      // Display consumables
      this.omegga.whisper(speaker, `<color="fff">Consumables: ${consumablesDisplay}</>`);
      
      this.omegga.whisper(speaker, `<color="888">Try /rpghelp for more commands</color>`);
    });

    // RPG initialization command - sets up interaction-based system
    this.omegga.on("cmd:rpginit", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f0f">Initializing RPG systems...</color>`);

      try {
        // Initialize the interaction-based RPG system
        await this.initializeRPGOnInteraction();
        
        this.omegga.whisper(speaker, `<color="0f0">RPG systems initialized successfully!</color>`);
        this.omegga.whisper(speaker, `<color="888">Click on RPG bricks to discover and activate them.</color>`);

      } catch (error) {
        console.error(`[Hoopla RPG] Error during RPG initialization:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error initializing RPG systems: ${error.message}</color>`);
      }
    });

    // RPG help command - shows all available commands
    this.omegga.on("cmd:rpghelp", async (speaker: string) => {
      this.omegga.whisper(speaker, `<color="0ff">=== RPG Commands ===</color>`);
      this.omegga.whisper(speaker, `<color="0ff">/rpg</> - Show your RPG stats and inventory`);
      this.omegga.whisper(speaker, `<color="0ff">/rpghelp</> - Show this help message`);
      this.omegga.whisper(speaker, `<color="0ff">/mininginfo</> - Show mining requirements`);
      this.omegga.whisper(speaker, `<color="0ff">/fishinginfo</> - Show fishing requirements`);
      this.omegga.whisper(speaker, `<color="0ff">/rpgleaderboard</> - Show top 10 players`);
    });

    // Leaderboard command - shows current top 10 players
    this.omegga.on("cmd:rpgleaderboard", async (speaker: string) => {
      try {
        const leaderboard = await this.getLeaderboard();
        
        if (leaderboard.length === 0) {
          this.omegga.whisper(speaker, `<color="ff0">No players found on the leaderboard yet!</color>`);
          return;
        }
        
        // Format leaderboard for whisper (multi-line for better readability)
        this.omegga.whisper(speaker, `<color="ff0">Top Players Leaderboard:</color>`);
        
        leaderboard.forEach((entry, index) => {
          const position = index + 1;
          const positionText = position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
          const message = `${positionText}. <color="0ff">${entry.name}</color> (Level ${entry.level}) - <color="ff0">${entry.score.toLocaleString()}</color> points`;
          this.omegga.whisper(speaker, message);
        });
        
      } catch (error) {
        console.error(`[Hoopla RPG] Error getting leaderboard:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error loading leaderboard: ${error.message}</color>`);
      }
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

    // Mining info command - shows mining level requirements
    this.omegga.on("cmd:mininginfo", async (speaker: string) => {
      this.omegga.whisper(speaker, `<color="0ff">=== Mining Level Requirements ===</color>`);
      this.omegga.whisper(speaker, `<color="fff">Copper: Any level</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Iron: Level 5+</color>`);
      this.omegga.whisper(speaker, `<color="00f">Gold: Level 10+</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Obsidian: Level 15+</color>`);
      this.omegga.whisper(speaker, `<color="f80">Diamond: Level 20+</color>`);
    });

    // Fishing info command - shows fish rarity and level requirements
    this.omegga.on("cmd:fishinginfo", async (speaker: string) => {
      this.omegga.whisper(speaker, `<color="0ff">=== Fish Rarity & Level Requirements ===</color>`);
      this.omegga.whisper(speaker, `<color="fff">Gup: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Cod: Uncommon (level 5+)</color>`);
      this.omegga.whisper(speaker, `<color="00f">Shark: Rare (level 10+)</color>`);
      this.omegga.whisper(speaker, `<color="f0f">Whale: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Kraken: Legendary (level 20+)</color>`);
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

    // RPG clear triggers command - clears only triggers (keeps player data)
    this.omegga.on("cmd:rpgcleartriggers", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Clearing all RPG triggers...</color>`);

      try {
        // Clear all triggers
        await this.setBrickTriggers({});

        this.omegga.whisper(speaker, `<color="0f0">All RPG triggers cleared successfully!</color>`);
        this.omegga.whisper(speaker, `<color="888">Click on RPG bricks to recreate them with updated prices.</color>`);

      } catch (error) {
        console.error(`[Hoopla RPG] Error clearing RPG triggers:`, error);
        this.omegga.whisper(speaker, `<color="f00">Error clearing RPG triggers: ${error.message}</color>`);
      }
    });





    // Duplicate interact event listener removed - using main one in initializeRPGOnInteraction()

    // Additional event listeners removed - using only the main interact listener
    
    // All component interaction listeners removed - using only the main interact listener
    
    // Console event listener removed - using only the main interact listener

    // Announce plugin reload to all players
    this.omegga.broadcast(`<color="0f0">Hoopla RPG plugin has been reloaded successfully!</color>`);
    console.log("Hoopla RPG: Plugin reload announcement sent to all players");

                      return { 
          registeredCommands: [
            "rpg", "rpginit", "rpghelp", "rpgclearall", "rpgcleartriggers", "mininginfo", "fishinginfo", "rpgleaderboard"
          ] 
        };
  }

  async stop() {}
}

