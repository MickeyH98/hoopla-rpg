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
  quests: { [questId: string]: QuestProgress }; // Track quest progress
  skills: {
    mining: { level: number; experience: number };
    bartering: { level: number; experience: number };
    fishing: { level: number; experience: number };
  };
};

type QuestProgress = {
  questId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  requirements: QuestRequirement[];
  completedRequirements: string[]; // Track which requirements are met
  interactionStep: number; // Track which step of the quest interaction we're on
};

type QuestRequirement = {
  id: string;
  type: 'item' | 'kill' | 'level' | 'skill';
  target: string; // Item name, enemy name, level number, or skill name
  amount: number; // How many items, kills, or level required
  description: string; // Human-readable description
};

type Quest = {
  id: string;
  name: string;
  description: string;
  requirements: QuestRequirement[];
  rewards: {
    xp: number;
    currency: number;
    items?: string[];
  };
  questgiver: {
    name: string;
    personality: string;
    greeting: string;
    questExplanation: string;
    reminderMessage: string;
    completionMessage: string;
  };
};

type BrickTrigger = {
  id: string;
  type: 'xp' | 'currency' | 'item' | 'heal' | 'sell' | 'fish' | 'bulk_sell' | 'buy' | 'quest' | 'questitem' | 'lava';
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
  // Quest item collection tracking (stored as array for JSON serialization)
  collectedBy?: string[];
  // Fishing spot type for different fish generation
  fishingSpotType?: string;
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
      quests: {}, // Initialize empty quest progress
      skills: {
        mining: { level: 0, experience: 0 },
        bartering: { level: 0, experience: 0 },
        fishing: { level: 0, experience: 0 }
      }
    };
  }

  // Memory cache for level 30 players to prevent data corruption
  private level30PlayerCache: Map<string, RPGPlayer> = new Map();

  // Click debounce system - track last click times per player
  private playerClickTimes: Map<string, number[]> = new Map();
  private readonly MAX_CLICKS_PER_SECOND = 10;

  // Clear cache for a specific player (useful for debugging)
  clearPlayerCache(playerId: string): void {
    this.level30PlayerCache.delete(playerId);
    console.log(`[Hoopla RPG] DEBUG: Cleared cache for player ${playerId}`);
  }

  // Check if player can click (debounce system)
  canPlayerClick(playerId: string): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Get or create click times array for this player
    let clickTimes = this.playerClickTimes.get(playerId) || [];
    
    // Remove clicks older than 1 second
    clickTimes = clickTimes.filter(time => time > oneSecondAgo);
    
    // Check if player has exceeded the limit
    if (clickTimes.length >= this.MAX_CLICKS_PER_SECOND) {
      return false;
    }
    
    // Add current click time
    clickTimes.push(now);
    this.playerClickTimes.set(playerId, clickTimes);
    
    return true;
  }

  async getPlayerData({ id }: PlayerId): Promise<RPGPlayer> {
    // Check if this is a level 30 player in our cache
    if (this.level30PlayerCache.has(id)) {
      const cachedPlayer = this.level30PlayerCache.get(id)!;
      return cachedPlayer;
    }

    const player = (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
    
    // Validate and clean inventory if needed
    if (player.inventory && player.inventory.length > 0) {
      const normalizedInventory = this.normalizeInventory(player.inventory);
      let inventoryChanged = false;
      
      // Check if any items were normalized
      for (let i = 0; i < player.inventory.length; i++) {
        if (player.inventory[i] !== normalizedInventory[i]) {
          inventoryChanged = true;
          break;
        }
      }
      
      // If inventory was cleaned, save it back
      if (inventoryChanged) {
        player.inventory = normalizedInventory;
        await this.setPlayerData({ id }, player);
      }
    }
    
    // If this player is level 30, cache them to prevent data corruption
    if (player.level === 30) {
      this.level30PlayerCache.set(id, { ...player });
    }
    
    return player;
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
          // Debug logging to see what subtype is being captured
          console.log(`[Hoopla RPG] DEBUG: Initializing fishing node with subtype: "${subtype}"`);
          
          // Determine fishing spot type and set appropriate message
          let fishingMessage = `Fishing for ${subtype}...`;
          if (subtype === 'spot') {
            fishingMessage = `Fishing in freshwater...`;
            console.log(`[Hoopla RPG] DEBUG: Setting up freshwater fishing spot`);
          } else if (subtype === 'spot_2') {
            fishingMessage = `Fishing in deep ocean...`;
            console.log(`[Hoopla RPG] DEBUG: Setting up deep ocean fishing spot`);
          } else if (subtype === 'spot_3') {
            fishingMessage = `Fishing in tropical reef...`;
            console.log(`[Hoopla RPG] DEBUG: Setting up tropical reef fishing spot`);
          } else if (subtype === 'spot_4') {
            fishingMessage = `Fishing in arctic waters...`;
            console.log(`[Hoopla RPG] DEBUG: Setting up arctic fishing spot`);
          } else {
            console.log(`[Hoopla RPG] DEBUG: Unknown fishing subtype: "${subtype}", using default message`);
          }
          
          trigger = {
            id: triggerId,
            type: 'fish',
            value: 1,
            cooldown: 3000,
            lastUsed: {},
            message: fishingMessage,
            color: '#00BFFF',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click',
            fishingProgress: {},
            fishingAttemptsRemaining: {},
            fishingSpotType: subtype // Store the fishing spot type for later use
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
            } else if (consoleTag.includes('saber')) {
              itemPrice = 5000; // Saber costs 5000 currency
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
          
        case 'quest':
          trigger = {
            id: triggerId,
            type: 'quest',
            value: 0,
            cooldown: 0, // No cooldown for quest interactions
            lastUsed: {},
            message: subtype, // Store the quest ID in the message (e.g., "john_brickington")
            color: '#9D4EDD', // Purple color for quests
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click'
          };
          break;
          
        case 'questitem':
          trigger = {
            id: triggerId,
            type: 'questitem',
            value: 1,
            cooldown: 0, // No cooldown for quest item collection
            lastUsed: {},
            message: subtype, // Store the quest item type in the message (e.g., "brickingway_box")
            color: '#9B59B6', // Purple color for quest items
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click',
            collectedBy: [] // Track which players have collected this item
          };
          break;
          
        case 'lava':
          trigger = {
            id: triggerId,
            type: 'lava',
            value: 25, // Default lava damage amount
            cooldown: 1000, // 1 second cooldown between damage ticks
            lastUsed: {},
            message: 'Lava damage',
            color: '#FF4500', // Orange-red color for lava
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            triggerType: 'click'
          };
          break;
          
        case 'damage':
          // Handle Damage property console print (e.g., rpg_damage_lava)
          if (subtype === 'lava') {
            trigger = {
              id: triggerId,
              type: 'lava',
              value: 25, // Default lava damage amount
              cooldown: 1000, // 1 second cooldown between damage ticks
              lastUsed: {},
              message: 'Lava damage (touch)',
              color: '#FF4500', // Orange-red color for lava
              brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
              triggerType: 'click' // Still use click for consistency with existing system
            };
          } else {
            return false; // Unknown damage type
          }
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

        // Check click debounce - limit to 10 clicks per second
        if (!this.canPlayerClick(playerId)) {
          console.log(`[Hoopla RPG] Click rate limited for player ${playerName} (${playerId})`);
          return;
        }

        // Store player username for leaderboard display
        await this.ensurePlayerUsername(player.id, player.name);

        // Check if this is an RPG console tag interaction
        if (data.message || data.tag) {
          const message = data.message || data.tag;
          const rpgMatch = message.match(/^rpg_(mining|fishing|sell|buy|quest|questitem|lava|damage)_(.+)$/i);
          if (rpgMatch) {
            const nodeType = rpgMatch[1]; // mining, fishing, sell, buy, quest, lava, damage
            const nodeSubtype = rpgMatch[2]; // iron, gold, spot, john_brickington, damage_lava, etc.
            
            // Debug logging for fishing nodes
            if (nodeType === 'fishing') {
              console.log(`[Hoopla RPG] DEBUG: Fishing node detected - Full message: "${message}", NodeType: "${nodeType}", NodeSubtype: "${nodeSubtype}"`);
            }
            
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
                if (nodeData.subtype === 'spot') {
                  initMessage = `Freshwater fishing spot initialized! Click again to start fishing.`;
                } else if (nodeData.subtype === 'spot_2') {
                  initMessage = `Deep ocean fishing spot initialized! Click again to start fishing.`;
                } else if (nodeData.subtype === 'spot_3') {
                  initMessage = `Tropical reef fishing spot initialized! Click again to start fishing.`;
                } else if (nodeData.subtype === 'spot_4') {
                  initMessage = `Arctic fishing spot initialized! Click again to start fishing.`;
                } else {
                  initMessage = `Fishing spot initialized! Click again to start fishing.`;
                }
              } else if (nodeData.type === 'mining') {
                initMessage = `Mining spot initialized! Click again to start mining.`;
              } else if (nodeData.type === 'sell') {
                initMessage = `Shop initialized! Click again to sell items.`;
              } else if (nodeData.type === 'buy') {
                initMessage = `Shop initialized! Click again to buy items.`;
              } else if (nodeData.type === 'quest') {
                initMessage = `<color="ff0">Questgiver initialized!</color> Click again to talk to the questgiver.`;
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
    
    // Update cache for level 30 players
    if (safeData.level === 30) {
      this.level30PlayerCache.set(id, { ...baseData, ...safeData });
    }
  }

  async addExperience({ id }: PlayerId, amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    const player = await this.getPlayerData({ id });
    const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
    
    // DEBUG: Log player data for keygen specifically
    if (playerName === "keygen") {
      console.log(`[Hoopla RPG] DEBUG: keygen addExperience called - Level: ${player.level}, XP: ${player.experience}, Amount: ${amount}`);
    }
    
    // Ensure all required properties exist with fallbacks
    if (player.level === undefined) player.level = this.config.startingLevel;
    if (player.experience === undefined) player.experience = 0;
    if (player.health === undefined) player.health = this.config.startingHealth;
    if (player.maxHealth === undefined) player.maxHealth = this.config.startingHealth;
    
    const oldLevel = player.level;
    
    // CRITICAL FIX: If player is already level 30, don't allow any level changes
    if (oldLevel === 30) {
      // Still add XP for tracking purposes, but don't change level
      player.experience += amount;
      await this.setPlayerData({ id }, player);
      
      const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
      console.log(`[Hoopla RPG] DEBUG: ${playerName} is already level 30, skipping level calculation. Added ${amount} XP for tracking.`);
      
      return { 
        leveledUp: false, 
        newLevel: 30 
      };
    }
    
    // Always add XP for score tracking, even at max level
    player.experience += amount;
    
    // ADDITIONAL SAFEGUARD: Check if player has enough XP to be level 30 but is showing as level 29
    // This might indicate data corruption or race conditions
    if (oldLevel === 29) {
      const xpForLevel30 = this.getXPForNextLevel(29);
      if (player.experience >= xpForLevel30) {
        const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
        console.log(`[Hoopla RPG] WARNING: ${playerName} shows as level 29 but has ${player.experience} XP (needs ${xpForLevel30} for level 30). Possible data corruption!`);
        
        // DEBUG: Additional logging for keygen
        if (playerName === "keygen") {
          console.log(`[Hoopla RPG] DEBUG: keygen triggering level 29 corruption fix - oldLevel: ${oldLevel}, XP: ${player.experience}, xpForLevel30: ${xpForLevel30}`);
        }
        
        // Force them to level 30
        player.level = 30;
        player.maxHealth += 10;
        player.health = player.maxHealth;
        
        // CRITICAL: Save the data and update cache immediately
        await this.setPlayerData({ id }, player);
        
        // Force update the cache to prevent reload issues
        this.level30PlayerCache.set(id, { ...player });
        
        // Verify the save worked
        const verifyPlayer = await this.getPlayerData({ id });
        if (verifyPlayer.level !== 30) {
          console.log(`[Hoopla RPG] ERROR: Failed to save level 30 for ${playerName}! Retrying...`);
          verifyPlayer.level = 30;
          verifyPlayer.maxHealth = player.maxHealth;
          verifyPlayer.health = player.health;
          await this.setPlayerData({ id }, verifyPlayer);
          this.level30PlayerCache.set(id, { ...verifyPlayer });
        }
        
        // Announce the level up
        this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level 30!</color>`);
        this.omegga.broadcast(`<color="0ff">${playerName} can now fly and leave minigames at will!</color>`);
        console.log(`[Hoopla RPG] ${playerName} leveled up from 29 to 30! (Data corruption fix)`);
        
        // Assign Flyer and MINIGAME LEAVER roles
        try {
          const player = this.omegga.getPlayer(id);
          if (player) {
            this.omegga.writeln(`Chat.Command /grantRole "Flyer" "${playerName}"`);
            this.omegga.writeln(`Chat.Command /grantRole "MINIGAME LEAVER" "${playerName}"`);
            console.log(`[Hoopla RPG] Assigned ${playerName} Flyer and MINIGAME LEAVER roles for reaching level 30!`);
          }
        } catch (error) {
          console.error(`[Hoopla RPG] Error assigning roles to ${playerName}:`, error);
        }
        
        return { 
          leveledUp: true, 
          newLevel: 30 
        };
      }
    }
    
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
      
      // DEBUG: Additional logging for keygen
      if (playerName === "keygen") {
        console.log(`[Hoopla RPG] DEBUG: keygen normal level-up path - oldLevel: ${oldLevel}, newLevel: ${newLevel}, XP: ${player.experience}`);
      }
      
      if (newLevel === 30) {
        this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level ${newLevel}!</color>`);
        this.omegga.broadcast(`<color="0ff">${playerName} can now fly and leave minigames at will!</color>`);
      } else {
        this.omegga.broadcast(`<color="ff0">Congratulations! ${playerName} has reached level ${newLevel}!</color>`);
      }
      console.log(`[Hoopla RPG] ${playerName} leveled up from ${oldLevel} to ${newLevel}!`);
      
      // Assign Flyer and MINIGAME LEAVER roles for level 30 players
      if (newLevel === 30) {
        try {
          const player = this.omegga.getPlayer(id);
          if (player) {
            this.omegga.writeln(`Chat.Command /grantRole "Flyer" "${playerName}"`);
            this.omegga.writeln(`Chat.Command /grantRole "MINIGAME LEAVER" "${playerName}"`);
            console.log(`[Hoopla RPG] Assigned ${playerName} Flyer and MINIGAME LEAVER roles for reaching level 30!`);
          }
        } catch (error) {
          console.error(`[Hoopla RPG] Error assigning roles to ${playerName}:`, error);
        }
        
        // CRITICAL: Extra save for level 30 players to prevent data loss
        await this.setPlayerData({ id }, player);
        
        // Force update the cache to prevent reload issues
        this.level30PlayerCache.set(id, { ...player });
      }
    } else if (oldLevel !== newLevel) {
      // This should never happen, but log it if it does
      const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
      console.log(`[Hoopla RPG] WARNING: Unexpected level change for ${playerName}! Old level: ${oldLevel}, New level: ${newLevel}`);
    }
    
    // Additional safeguard: Check if the player's stored level is different from what we calculated
    if (player.level !== newLevel) {
      const playerName = this.omegga.getPlayer(id)?.name || "Unknown Player";
      console.log(`[Hoopla RPG] WARNING: Level mismatch for ${playerName}! Stored level: ${player.level}, Calculated level: ${newLevel}. Correcting...`);
      player.level = newLevel;
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

  // INVENTORY NORMALIZATION SYSTEM
  
  // Comprehensive item name normalization - fixes all malformed names
  normalizeItemName(itemName: string): string {
    if (!itemName) return itemName;
    
    const normalized = itemName.trim();
    
    // Handle malformed mining messages
    if (normalized.startsWith('Mining ') && normalized.endsWith('...')) {
      const oreType = normalized.replace('Mining ', '').replace('...', '').toLowerCase();
      return this.getItemName(oreType);
    }
    
    // Handle direct malformed names
    switch (normalized.toLowerCase()) {
      case 'mining gold...':
        return 'Gold Ore';
      case 'mining diamond...':
        return 'Diamond Ore';
      case 'mining iron...':
        return 'Iron Ore';
      case 'mining copper...':
        return 'Copper Ore';
      case 'mining obsidian...':
        return 'Obsidian Ore';
      case 'obsidian':
        return 'Obsidian Ore';
      case 'fish bait':
        return 'Fish bait'; // Keep consistent with existing system
      default:
        // For properly named items, return as-is
        return normalized;
    }
  }

  // Clean and normalize an entire inventory array
  normalizeInventory(inventory: string[]): string[] {
    if (!inventory || !Array.isArray(inventory)) {
      return [];
    }
    
    return inventory.map(item => this.normalizeItemName(item));
  }

  // Clean a single player's inventory and save it
  async cleanPlayerInventory({ id }: PlayerId): Promise<{ cleaned: number; originalCount: number }> {
    const player = await this.getPlayerData({ id });
    const originalCount = player.inventory ? player.inventory.length : 0;
    
    if (!player.inventory || player.inventory.length === 0) {
      return { cleaned: 0, originalCount: 0 };
    }
    
    // Normalize the inventory
    const normalizedInventory = this.normalizeInventory(player.inventory);
    
    // Count how many items were actually changed
    let cleaned = 0;
    for (let i = 0; i < player.inventory.length; i++) {
      if (player.inventory[i] !== normalizedInventory[i]) {
        cleaned++;
      }
    }
    
    // Update the player's inventory
    player.inventory = normalizedInventory;
    await this.setPlayerData({ id }, player);
    
    return { cleaned, originalCount };
  }

  // QUEST SYSTEM METHODS

  // Get all available quests
  getAllQuests(): Quest[] {
    return [
      {
        id: 'john_brickington_1',
        name: 'John Brickington\'s Starter Pack',
        description: 'Help John Brickington get 5 Gups to start his fish business',
        requirements: [
          {
            id: 'gup_requirement',
            type: 'item',
            target: 'Gup',
            amount: 5,
            description: 'Collect 5 Gups from fishing'
          }
        ],
        rewards: {
          xp: 500,
          currency: 250,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yo what\'s good fam! Names John Brickington and I\'m totally not sus at all. Just a regular fisherman trying to make it in this crazy world. You look like someone who knows their way around a fishing rod ngl.',
          questExplanation: 'So check it, I\'m starting this totally legit fish importing business right? My grandma left me this old fishing company and I need to get it running again. I need exactly 5 Gups to show my business partners I\'m serious about this whole operation.',
          reminderMessage: 'Yo yo yo, still need those 5 Gups fam! My business partners are getting kinda impatient and asking questions about the timeline. Just between us, they\'re kinda scary when mad so no pressure but also kinda pressure you know?',
          completionMessage: 'YOOO these Gups are absolutely bussin! My business partners are gonna be so impressed with the quality. You\'re literally carrying my whole operation right now! This is just the beginning though, I got bigger plans brewing.'
        }
      },
      {
        id: 'john_brickington_2',
        name: 'John Brickington\'s Cod Collection',
        description: 'Help John Brickington get 5 Cod for his expanding business',
        requirements: [
          {
            id: 'cod_requirement',
            type: 'item',
            target: 'Cod',
            amount: 5,
            description: 'Collect 5 Cod from fishing'
          }
        ],
        rewards: {
          xp: 750,
          currency: 400,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo my guy is back! Bro those Gups were straight fire, my business partners were so impressed they want to expand operations immediately. You\'ve got some serious fishing skills ngl.',
          questExplanation: 'Okay so like, plot twist time! My business partners want to expand into the premium fish market. They\'re asking for exactly 5 Cod this time because apparently they have some very specific clients with very specific tastes. These clients sound kinda weird but they pay BANK so who am I to judge right?',
          reminderMessage: 'Yo still need those 5 Cod! My business partners keep asking me about the timeline and honestly they\'re starting to give me weird vibes. They keep talking about some project called Operation Fishbowl but like, probably just a code name right?',
          completionMessage: 'Yooo these Cod are perfect! My business partners just called and they\'re absolutely losing their minds over the quality. They said something about the specimens being ideal for the next phase of Operation Fishbowl. Just fancy business talk though, right?'
        }
      },
      {
        id: 'john_brickington_3',
        name: 'John Brickington\'s Shark Showdown',
        description: 'Help John Brickington get 5 Sharks for his premium clientele',
        requirements: [
          {
            id: 'shark_requirement',
            type: 'item',
            target: 'Shark',
            amount: 5,
            description: 'Collect 5 Sharks from fishing'
          }
        ],
        rewards: {
          xp: 1000,
          currency: 600,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo you\'re back! Okay so like, don\'t freak out but I think my business partners might not be who they said they were. They keep asking really weird questions about the fish and they have these fancy lab coats and clipboards. But hey, money is money right?',
          questExplanation: 'Okay so like, things are getting kinda sus but hear me out. My business partners want 5 Sharks now and they keep talking about genetic sequencing and marine biology research. I asked them about it and they just laughed nervously and changed the subject. But like, they\'re paying me triple now so I\'m not asking too many questions.',
          reminderMessage: 'Yo still need those 5 Sharks! My business partners showed up at my house yesterday with a whole van full of scientific equipment. They said they need to test the fish for purity levels or something. I\'m starting to think this isn\'t a normal fish business but the money is too good to stop now.',
          completionMessage: 'Yooo these Sharks are perfect! My business partners just took them away in some kind of refrigerated truck with government plates. They said something about Phase 3 of the marine enhancement project. I\'m getting really worried but they just doubled my payment again so like, I guess we\'re in too deep now?'
        }
      },
      {
        id: 'john_brickington_4',
        name: 'John Brickington\'s Whale Wonder',
        description: 'Help John Brickington get 5 Whales for his elite clientele',
        requirements: [
          {
            id: 'whale_requirement',
            type: 'item',
            target: 'Whale',
            amount: 5,
            description: 'Collect 5 Whales from fishing'
          }
        ],
        rewards: {
          xp: 1250,
          currency: 800,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo okay so like, I need to tell you something kinda crazy. I found out my business partners aren\'t actually business partners. They\'re government scientists working on some top secret marine life project. But they\'re paying me so much money I don\'t even care anymore lmao.',
          questExplanation: 'Okay so like, the government scientists need 5 Whales for the final phase of their experiment. They told me they\'re trying to create some kind of super intelligent marine ecosystem or something wild like that. I\'m pretty sure we\'re helping them build an underwater army but the money is so good.',
          reminderMessage: 'Yo still need those 5 Whales! The government scientists keep calling me every hour asking about the timeline. They said something about needing to synchronize the Whales with the other marine specimens for the final phase. I\'m starting to think we might be in over our heads but like, YOLO right?',
          completionMessage: 'Yooo these Whales are incredible! The government scientists just arrived with a whole convoy of trucks and helicopters. They said the Whales are the key to completing their marine intelligence network. I think we just helped them create some kind of underwater surveillance system but hey, we\'re rich now!'
        }
      },
      {
        id: 'john_brickington_5',
        name: 'John Brickington\'s Kraken Quest',
        description: 'Help John Brickington get 1 Kraken for his ultimate client',
        requirements: [
          {
            id: 'kraken_requirement',
            type: 'item',
            target: 'Kraken',
            amount: 1,
            description: 'Collect 1 Kraken from fishing'
          }
        ],
        rewards: {
          xp: 2000,
          currency: 1500,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'John Brickington',
          personality: 'A Gen Z fisherman who speaks in internet slang and brainrot terms while trying to sound professional about fish',
          greeting: 'Yooo my guy! Okay so like, I have a confession to make. I\'ve been lying to you this whole time. I\'m not actually John Brickington the fisherman. I\'m Agent John Brickington, undercover marine biologist for a top secret government project. Sorry for the deception!',
          questExplanation: 'Okay so like, the truth is we\'ve been building a massive underwater communication network using marine life as biological transmitters. The Kraken is the final piece we need to complete Operation Fishbowl. It\'s gonna be the central hub that controls all the other fish we\'ve collected. You\'ve been helping save the world this whole time!',
          reminderMessage: 'Yo still need that Kraken! My team at the lab is getting antsy because we need to activate the network before the enemy discovers what we\'re doing. The fate of underwater national security literally depends on this one Kraken. No pressure though lmao.',
          completionMessage: 'YOOO WE DID IT! Operation Fishbowl is complete! The Kraken just connected to our network and we now have full underwater surveillance coverage of the entire ocean. You literally just helped us create the world\'s first biological internet! My real name is Agent Brickington and you\'ve been recruited as an honorary marine intelligence operative. Welcome to the team, no cap!'
        }
      },
      {
        id: 'frank_bricktavious_1',
        name: 'Frank Bricktavious\'s Copper Foundation',
        description: 'Help Frank Bricktavious get 10 Copper Ore to start his monument project',
        requirements: [
          {
            id: 'copper_requirement',
            type: 'item',
            target: 'Copper Ore',
            amount: 10,
            description: 'Collect 10 Copper Ore from mining'
          }
        ],
        rewards: {
          xp: 600,
          currency: 300,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! Name\'s Frank Bricktavious, retired mining engineer extraordinaire. I been workin\' these mines for nigh on forty years, and I reckon you look like someone who knows their way around a pickaxe.',
          questExplanation: 'See here, I\'m buildin\' myself a mighty fine monument to my legacy as the greatest miner this side of the Mississippi. I need exactly 10 pieces of Copper Ore to get the foundation started. This here monument\'s gonna be the talk of the town, no cap!',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 Copper Ore pieces for my monument? No rush, but I\'m gettin\' mighty excited to see this thing come together. Just make sure they\'re good quality ore, ya hear?',
          completionMessage: 'Well I\'ll be! These Copper Ore pieces are absolutely magnificent! You\'ve got the eye of a true miner, my friend. This foundation is gonna be rock solid, literally! I can already see my monument takin\' shape in my mind\'s eye.'
        }
      },
      {
        id: 'frank_bricktavious_2',
        name: 'Frank Bricktavious\'s Iron Framework',
        description: 'Help Frank Bricktavious get 10 Iron Ore for the monument\'s framework',
        requirements: [
          {
            id: 'iron_requirement',
            type: 'item',
            target: 'Iron Ore',
            amount: 10,
            description: 'Collect 10 Iron Ore from mining'
          }
        ],
        rewards: {
          xp: 900,
          currency: 500,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! That Copper foundation you brought me is lookin\' mighty fine. I been tellin\' everyone in town about the skilled miner who\'s helpin\' me build my legacy monument.',
          questExplanation: 'Now we need to move on to the framework, and for that I need exactly 10 pieces of Iron Ore. This here monument\'s gonna be so sturdy it\'ll last a thousand years! I been dreamin\' about this day since I first picked up a pickaxe as a young whippersnapper.',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 Iron Ore pieces for the framework? I been measurin\' and plannin\' all day, and I reckon this monument\'s gonna be the most impressive thing this town has ever seen!',
          completionMessage: 'Hot diggity! These Iron Ore pieces are exactly what I needed! The framework is gonna be so strong it could hold up a mountain. You\'re turnin\' out to be quite the mining partner, I tell ya what!'
        }
      },
      {
        id: 'frank_bricktavious_3',
        name: 'Frank Bricktavious\'s Golden Glory',
        description: 'Help Frank Bricktavious get 10 Gold Ore for the monument\'s golden accents',
        requirements: [
          {
            id: 'gold_requirement',
            type: 'item',
            target: 'Gold Ore',
            amount: 10,
            description: 'Collect 10 Gold Ore from mining'
          }
        ],
        rewards: {
          xp: 1200,
          currency: 700,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! That Iron framework is lookin\' absolutely spectacular! I been gettin\' so many compliments from folks passin\' by. They can\'t believe how fast this monument is comin\' together.',
          questExplanation: 'Now for the real showstopper - I need exactly 10 pieces of Gold Ore for the golden accents. This here monument\'s gonna shine brighter than the sun itself! I want people to see it from miles away and know that Frank Bricktavious built something truly magnificent.',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 Gold Ore pieces for the golden accents? I been polishin\' the plans and I reckon this monument\'s gonna be so shiny it\'ll blind folks with its beauty!',
          completionMessage: 'Well butter my biscuit! These Gold Ore pieces are absolutely gorgeous! The golden accents are gonna make this monument look like it came straight out of a fairy tale. You\'re makin\' an old miner\'s dreams come true!'
        }
      },
      {
        id: 'frank_bricktavious_4',
        name: 'Frank Bricktavious\'s Obsidian Opulence',
        description: 'Help Frank Bricktavious get 10 Obsidian Ore for the monument\'s dark accents',
        requirements: [
          {
            id: 'obsidian_requirement',
            type: 'item',
            target: 'Obsidian Ore',
            amount: 10,
            description: 'Collect 10 Obsidian Ore from mining'
          }
        ],
        rewards: {
          xp: 1500,
          currency: 900,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! That Gold Ore you brought me is makin\' this monument shine like a beacon of hope! I been gettin\' visitors from three counties over just to see the progress.',
          questExplanation: 'Now I need exactly 10 pieces of Obsidian Ore for the dark accents. This here monument\'s gonna have the perfect contrast - bright gold and deep obsidian black. It\'ll be like a work of art that tells the story of my forty years in the mines.',
          reminderMessage: 'Howdy again! Still workin\' on gatherin\' those 10 Obsidian Ore pieces for the dark accents? I been thinkin\' about the design and I reckon this contrast between gold and obsidian is gonna be absolutely breathtaking!',
          completionMessage: 'Well I\'ll be hornswoggled! These Obsidian Ore pieces are exactly what I needed! The contrast between the gold and obsidian is gonna be so striking it\'ll take folks\' breath away. You\'re helpin\' me create a true masterpiece!'
        }
      },
      {
        id: 'frank_bricktavious_5',
        name: 'Frank Bricktavious\'s Diamond Destiny',
        description: 'Help Frank Bricktavious get 1 Diamond Ore for the monument\'s crown jewel',
        requirements: [
          {
            id: 'diamond_requirement',
            type: 'item',
            target: 'Diamond Ore',
            amount: 1,
            description: 'Collect 1 Diamond Ore from mining'
          }
        ],
        rewards: {
          xp: 2500,
          currency: 2000,
          items: ['Fish bait']
        },
        questgiver: {
          name: 'Frank Bricktavious',
          personality: 'A retired mining engineer with a thick southern accent who speaks like an old-timey prospector but uses modern slang',
          greeting: 'Well howdy there, partner! This monument is lookin\' absolutely magnificent! I been gettin\' so emotional thinkin\' about what this represents. But I got one final request that\'ll make this monument truly legendary.',
          questExplanation: 'I need exactly 1 piece of Diamond Ore for the crown jewel of my monument. This here diamond\'s gonna be the centerpiece that represents all my years of hard work and dedication to the mining craft. It\'ll be the final touch that makes this monument a true testament to the mining life.',
          reminderMessage: 'Howdy again! Still workin\' on findin\' that 1 Diamond Ore for the crown jewel? I know it\'s a tall order, but this diamond\'s gonna be the perfect finishing touch to my legacy monument. No pressure, but it\'s the most important piece of all!',
          completionMessage: 'WELL I\'LL BE DARNED! This Diamond Ore is absolutely perfect! My monument is finally complete, and it\'s more beautiful than I ever dreamed possible. You\'ve helped me create something that\'ll stand as a testament to the mining life for generations to come. Thank you, partner, from the bottom of my heart!'
        }
      },
      {
        id: 'emmet_brickingway_1',
        name: 'Emmet Brickingway\'s Lost Manuscripts',
        description: 'Help Emmet Brickingway recover his lost Brickingway Boxes containing the truth about the island\'s sudden appearance',
        requirements: [
          {
            id: 'brickingway_box_requirement',
            type: 'item',
            target: 'Brickingway Box',
            amount: 10,
            description: 'Collect 10 Brickingway Boxes containing the only record of the island\'s mysterious appearance'
          }
        ],
        rewards: {
          xp: 3000,
          currency: 2000,
          items: ['Fish bait', 'Fish bait']
        },
        questgiver: {
          name: 'Emmet Brickingway',
          personality: 'A weathered writer with a Hemingway-esque stoicism, speaks in short, powerful sentences with deep meaning. He carries the weight of lost stories and unfinished works.',
          greeting: 'Sit down. I have a story to tell you. Not about war or bullfighting, but about mystery. About how this very island came to be. I was exploring the local waterfall yesterday, seeking inspiration in the roar of falling water. But the current was strong, and my manuscripts were scattered. My life\'s work, lost in the mist. There\'s something about that waterfall... something that shouldn\'t exist. But I cannot speak of it until my stories are whole again.',
          questExplanation: 'I need you to find my Brickingway Boxes. You must collect exactly 10 of them to complete this quest. Each contains fragments of stories I never finished. Stories of courage, of loss, of the human condition. But more than that... they contain the truth about this place. Look for them near the waterfall and in the surrounding area. Start your search at the waterfall itself. The water may have carried them downstream, or they may be hidden among the rocks and trees nearby. Search carefully - they are small wooden boxes with my name carved into them. They are not just boxes. They are pieces of my soul, and pieces of a secret that will shake you to your core.',
          reminderMessage: 'The boxes are still out there, near the waterfall and beyond. You need to find all 10 Brickingway Boxes to complete this quest. Each one you find brings me closer to completing what I started. The stories must be told. They demand to be heard. Have you searched the waterfall area thoroughly? Look for small wooden boxes with my name carved into them. How many have you found so far? The truth about this island waits in those boxes, and it will change everything you think you know.',
          completionMessage: 'You have done what I could not. You have brought my stories home from the waterfall\'s embrace. Now I can tell you the truth. This island did not exist a week ago. It simply appeared, fully formed, as if it had always been here. But it hadn\'t. I was there when it materialized from nothing. The waterfall you searched? It was the first thing I saw when this impossible place came into being. My boxes contained the only record of what happened that day - the day the world changed forever. Thank you, friend. The stories will live again, and now you know the impossible truth.'
        }
      }
    ];
  }

  // Helper function to send long messages as multiple whispers
  sendLongMessage(playerId: string, message: string, maxLength: number = 200): void {
    // Split message into chunks that fit within the character limit
    const chunks = [];
    let currentChunk = '';
    
    // Split by words to avoid breaking words
    const words = message.split(' ');
    
    for (const word of words) {
      // Check if adding this word would exceed the limit
      if (currentChunk.length + word.length + 1 > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + word;
      }
    }
    
    // Add the last chunk if it's not empty
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    // Send each chunk as a separate whisper
    for (const chunk of chunks) {
      this.omegga.whisper(playerId, chunk);
    }
  }

  // Get quest by ID
  getQuestById(questId: string): Quest | null {
    const quests = this.getAllQuests();
    
    // Handle legacy quest ID - redirect to first quest in chain
    if (questId === 'john_brickington') {
      return quests.find(quest => quest.id === 'john_brickington_1') || null;
    }
    
    // Handle Frank Bricktavious quest ID - redirect to first quest in chain
    if (questId === 'frank_bricktavious') {
      return quests.find(quest => quest.id === 'frank_bricktavious_1') || null;
    }
    
    return quests.find(quest => quest.id === questId) || null;
  }

  // Get next quest in chain
  getNextQuestInChain(currentQuestId: string): string | null {
    // John Brickington quest chain
    const johnQuestChain = [
      'john_brickington_1',
      'john_brickington_2', 
      'john_brickington_3',
      'john_brickington_4',
      'john_brickington_5'
    ];
    
    // Frank Bricktavious quest chain
    const frankQuestChain = [
      'frank_bricktavious_1',
      'frank_bricktavious_2',
      'frank_bricktavious_3',
      'frank_bricktavious_4',
      'frank_bricktavious_5'
    ];
    
    // Emmet Brickingway quest chain (single quest for now)
    const emmetQuestChain = [
      'emmet_brickingway_1'
    ];
    
    // Check John's quest chain
    const johnIndex = johnQuestChain.indexOf(currentQuestId);
    if (johnIndex >= 0 && johnIndex < johnQuestChain.length - 1) {
      return johnQuestChain[johnIndex + 1];
    }
    
    // Check Frank's quest chain
    const frankIndex = frankQuestChain.indexOf(currentQuestId);
    if (frankIndex >= 0 && frankIndex < frankQuestChain.length - 1) {
      return frankQuestChain[frankIndex + 1];
    }
    
    // Check Emmet's quest chain
    const emmetIndex = emmetQuestChain.indexOf(currentQuestId);
    if (emmetIndex >= 0 && emmetIndex < emmetQuestChain.length - 1) {
      return emmetQuestChain[emmetIndex + 1];
    }
    
    return null; // No next quest in chain
  }

  // Check if player has completed quest requirements
  checkQuestRequirements(player: RPGPlayer, quest: Quest): { completed: boolean; completedRequirements: string[] } {
    const completedRequirements: string[] = [];
    
    for (const requirement of quest.requirements) {
      let requirementMet = false;
      
      switch (requirement.type) {
        case 'item':
          const itemCount = player.inventory?.filter(item => 
            item.toLowerCase() === requirement.target.toLowerCase()
          ).length || 0;
          requirementMet = itemCount >= requirement.amount;
          break;
          
        case 'level':
          requirementMet = player.level >= requirement.amount;
          break;
          
        case 'skill':
          const skillLevel = player.skills?.[requirement.target as keyof typeof player.skills]?.level || 0;
          requirementMet = skillLevel >= requirement.amount;
          break;
          
        case 'kill':
          // For future implementation - track kills
          requirementMet = false;
          break;
      }
      
      if (requirementMet) {
        completedRequirements.push(requirement.id);
      }
    }
    
    return {
      completed: completedRequirements.length === quest.requirements.length,
      completedRequirements
    };
  }

  // Complete quest and give rewards
  async completeQuest(playerId: string, quest: Quest): Promise<void> {
    const player = await this.getPlayerData({ id: playerId });
    
    // Remove required items from inventory
    for (const requirement of quest.requirements) {
      if (requirement.type === 'item') {
        let itemsToRemove = requirement.amount;
        player.inventory = player.inventory.filter(item => {
          if (itemsToRemove > 0 && item.toLowerCase() === requirement.target.toLowerCase()) {
            itemsToRemove--;
            return false; // Remove this item
          }
          return true; // Keep this item
        });
      }
    }
    
    // Give rewards
    await this.addExperience({ id: playerId }, quest.rewards.xp);
    await this.currency.add(playerId, "currency", quest.rewards.currency);
    
    if (quest.rewards.items) {
      for (const item of quest.rewards.items) {
        await this.addToInventory({ id: playerId }, item);
      }
    }
    
    // Mark quest as completed
    if (!player.quests) {
      player.quests = {};
    }
    player.quests[quest.id] = {
      questId: quest.id,
      status: 'completed',
      requirements: quest.requirements,
      completedRequirements: quest.requirements.map(req => req.id),
      interactionStep: 3
    };
    
    await this.setPlayerData({ id: playerId }, player);
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
      baseClicks = 12;
      unlockLevel = 15;
    }
    // Legendary fish (requires fishing level 20)
    else if (fish === 'kraken' || fish === 'leviathan' || fish === 'sea dragon' || fish === 'frost kraken') {
      baseClicks = 15;
      unlockLevel = 20;
    }
    
    // Calculate scaling: from baseClicks at unlock level to 1 at level 30
    // Linear scaling from unlock level to level 30
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

  // Fish generation for fishing spot 2 (Ocean/Deep Sea)
  getRandomFishType_2(fishingLevel: number, guaranteedCatch: boolean = false): { fishType: string; rarity: string } | null {
    // Calculate failure chance (skip if using bait for guaranteed catch)
    if (!guaranteedCatch) {
      const failureChance = this.getFishingFailureChance(fishingLevel);
      if (Math.random() < failureChance) {
        return null; // Failed to catch anything
      }
    }
    
    // Fish rarity distribution based on fishing level (same rates as original)
    let sardineChance = 0.70;    // Base chance for Sardine (70%)
    let tunaChance = 0.25;       // Base chance for Tuna (25%)
    let marlinChance = 0.05;     // Base chance for Marlin (5%)
    let megalodonChance = 0.0;   // Base chance for Megalodon (0%)
    let leviathanChance = 0.0;   // Base chance for Leviathan (0%)
    
    // Adjust chances based on fishing level (same progression as original)
    if (fishingLevel >= 25) {
      sardineChance = 0.30;      // 30% Sardine
      tunaChance = 0.30;         // 30% Tuna
      marlinChance = 0.25;       // 25% Marlin
      megalodonChance = 0.10;    // 10% Megalodon
      leviathanChance = 0.05;    // 5% Leviathan
    } else if (fishingLevel >= 20) {
      sardineChance = 0.35;      // 35% Sardine
      tunaChance = 0.30;         // 30% Tuna
      marlinChance = 0.25;       // 25% Marlin
      megalodonChance = 0.08;    // 8% Megalodon
      leviathanChance = 0.02;    // 2% Leviathan
    } else if (fishingLevel >= 15) {
      sardineChance = 0.45;      // 45% Sardine
      tunaChance = 0.35;         // 35% Tuna
      marlinChance = 0.18;       // 18% Marlin
      megalodonChance = 0.02;    // 2% Megalodon
      leviathanChance = 0.0;     // 0% Leviathan
    } else if (fishingLevel >= 10) {
      sardineChance = 0.55;      // 55% Sardine
      tunaChance = 0.30;         // 30% Tuna
      marlinChance = 0.15;       // 15% Marlin
      megalodonChance = 0.0;     // 0% Megalodon
      leviathanChance = 0.0;     // 0% Leviathan
    } else if (fishingLevel >= 5) {
      sardineChance = 0.65;      // 65% Sardine
      tunaChance = 0.30;         // 30% Tuna
      marlinChance = 0.05;       // 5% Marlin
      megalodonChance = 0.0;     // 0% Megalodon
      leviathanChance = 0.0;     // 0% Leviathan
    }
    
    // Generate random number and determine fish type
    const roll = Math.random();
    
    if (roll < sardineChance) {
      return { fishType: 'Sardine', rarity: 'Common' };
    } else if (roll < sardineChance + tunaChance) {
      return { fishType: 'Tuna', rarity: 'Uncommon' };
    } else if (roll < sardineChance + tunaChance + marlinChance) {
      return { fishType: 'Marlin', rarity: 'Rare' };
    } else if (roll < sardineChance + tunaChance + marlinChance + megalodonChance) {
      return { fishType: 'Megalodon', rarity: 'Epic' };
    } else {
      return { fishType: 'Leviathan', rarity: 'Legendary' };
    }
  }

  // Fish generation for fishing spot 3 (Tropical/Reef)
  getRandomFishType_3(fishingLevel: number, guaranteedCatch: boolean = false): { fishType: string; rarity: string } | null {
    // Calculate failure chance (skip if using bait for guaranteed catch)
    if (!guaranteedCatch) {
      const failureChance = this.getFishingFailureChance(fishingLevel);
      if (Math.random() < failureChance) {
        return null; // Failed to catch anything
      }
    }
    
    // Fish rarity distribution based on fishing level (same rates as original)
    let clownfishChance = 0.70;    // Base chance for Clownfish (70%)
    let angelfishChance = 0.25;    // Base chance for Angelfish (25%)
    let lionfishChance = 0.05;     // Base chance for Lionfish (5%)
    let mantaRayChance = 0.0;      // Base chance for Manta Ray (0%)
    let seaDragonChance = 0.0;     // Base chance for Sea Dragon (0%)
    
    // Adjust chances based on fishing level (same progression as original)
    if (fishingLevel >= 25) {
      clownfishChance = 0.30;      // 30% Clownfish
      angelfishChance = 0.30;      // 30% Angelfish
      lionfishChance = 0.25;       // 25% Lionfish
      mantaRayChance = 0.10;       // 10% Manta Ray
      seaDragonChance = 0.05;      // 5% Sea Dragon
    } else if (fishingLevel >= 20) {
      clownfishChance = 0.35;      // 35% Clownfish
      angelfishChance = 0.30;      // 30% Angelfish
      lionfishChance = 0.25;       // 25% Lionfish
      mantaRayChance = 0.08;       // 8% Manta Ray
      seaDragonChance = 0.02;      // 2% Sea Dragon
    } else if (fishingLevel >= 15) {
      clownfishChance = 0.45;      // 45% Clownfish
      angelfishChance = 0.35;      // 35% Angelfish
      lionfishChance = 0.18;       // 18% Lionfish
      mantaRayChance = 0.02;       // 2% Manta Ray
      seaDragonChance = 0.0;       // 0% Sea Dragon
    } else if (fishingLevel >= 10) {
      clownfishChance = 0.55;      // 55% Clownfish
      angelfishChance = 0.30;      // 30% Angelfish
      lionfishChance = 0.15;       // 15% Lionfish
      mantaRayChance = 0.0;        // 0% Manta Ray
      seaDragonChance = 0.0;       // 0% Sea Dragon
    } else if (fishingLevel >= 5) {
      clownfishChance = 0.65;      // 65% Clownfish
      angelfishChance = 0.30;      // 30% Angelfish
      lionfishChance = 0.05;       // 5% Lionfish
      mantaRayChance = 0.0;        // 0% Manta Ray
      seaDragonChance = 0.0;       // 0% Sea Dragon
    }
    
    // Generate random number and determine fish type
    const roll = Math.random();
    
    if (roll < clownfishChance) {
      return { fishType: 'Clownfish', rarity: 'Common' };
    } else if (roll < clownfishChance + angelfishChance) {
      return { fishType: 'Angelfish', rarity: 'Uncommon' };
    } else if (roll < clownfishChance + angelfishChance + lionfishChance) {
      return { fishType: 'Lionfish', rarity: 'Rare' };
    } else if (roll < clownfishChance + angelfishChance + lionfishChance + mantaRayChance) {
      return { fishType: 'Manta Ray', rarity: 'Epic' };
    } else {
      return { fishType: 'Sea Dragon', rarity: 'Legendary' };
    }
  }

  // Fish generation for fishing spot 4 (Arctic/Ice)
  getRandomFishType_4(fishingLevel: number, guaranteedCatch: boolean = false): { fishType: string; rarity: string } | null {
    // Calculate failure chance (skip if using bait for guaranteed catch)
    if (!guaranteedCatch) {
      const failureChance = this.getFishingFailureChance(fishingLevel);
      if (Math.random() < failureChance) {
        return null; // Failed to catch anything
      }
    }
    
    // Fish rarity distribution based on fishing level (same rates as original)
    let icefishChance = 0.70;      // Base chance for Icefish (70%)
    let arcticCharChance = 0.25;   // Base chance for Arctic Char (25%)
    let belugaChance = 0.05;       // Base chance for Beluga (5%)
    let narwhalChance = 0.0;       // Base chance for Narwhal (0%)
    let frostKrakenChance = 0.0;   // Base chance for Frost Kraken (0%)
    
    // Adjust chances based on fishing level (same progression as original)
    if (fishingLevel >= 25) {
      icefishChance = 0.30;        // 30% Icefish
      arcticCharChance = 0.30;     // 30% Arctic Char
      belugaChance = 0.25;         // 25% Beluga
      narwhalChance = 0.10;        // 10% Narwhal
      frostKrakenChance = 0.05;    // 5% Frost Kraken
    } else if (fishingLevel >= 20) {
      icefishChance = 0.35;        // 35% Icefish
      arcticCharChance = 0.30;     // 30% Arctic Char
      belugaChance = 0.25;         // 25% Beluga
      narwhalChance = 0.08;        // 8% Narwhal
      frostKrakenChance = 0.02;    // 2% Frost Kraken
    } else if (fishingLevel >= 15) {
      icefishChance = 0.45;        // 45% Icefish
      arcticCharChance = 0.35;     // 35% Arctic Char
      belugaChance = 0.18;         // 18% Beluga
      narwhalChance = 0.02;        // 2% Narwhal
      frostKrakenChance = 0.0;     // 0% Frost Kraken
    } else if (fishingLevel >= 10) {
      icefishChance = 0.55;        // 55% Icefish
      arcticCharChance = 0.30;     // 30% Arctic Char
      belugaChance = 0.15;         // 15% Beluga
      narwhalChance = 0.0;         // 0% Narwhal
      frostKrakenChance = 0.0;     // 0% Frost Kraken
    } else if (fishingLevel >= 5) {
      icefishChance = 0.65;        // 65% Icefish
      arcticCharChance = 0.30;     // 30% Arctic Char
      belugaChance = 0.05;         // 5% Beluga
      narwhalChance = 0.0;         // 0% Narwhal
      frostKrakenChance = 0.0;     // 0% Frost Kraken
    }
    
    // Generate random number and determine fish type
    const roll = Math.random();
    
    if (roll < icefishChance) {
      return { fishType: 'Icefish', rarity: 'Common' };
    } else if (roll < icefishChance + arcticCharChance) {
      return { fishType: 'Arctic Char', rarity: 'Uncommon' };
    } else if (roll < icefishChance + arcticCharChance + belugaChance) {
      return { fishType: 'Beluga', rarity: 'Rare' };
    } else if (roll < icefishChance + arcticCharChance + belugaChance + narwhalChance) {
      return { fishType: 'Narwhal', rarity: 'Epic' };
    } else {
      return { fishType: 'Frost Kraken', rarity: 'Legendary' };
    }
  }

  // Check if player can catch a specific fish type based on fishing level
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
  // Get comprehensive fish data including rarity and color
  getFishData(fishName: string): { name: string; rarity: string; color: string; spot: string } | null {
    const fish = fishName.toLowerCase();
    
    // Original freshwater fish
    if (fish === 'gup') return { name: 'Gup', rarity: 'Common', color: 'fff', spot: 'Freshwater' };
    if (fish === 'cod') return { name: 'Cod', rarity: 'Uncommon', color: '0f0', spot: 'Freshwater' };
    if (fish === 'shark') return { name: 'Shark', rarity: 'Rare', color: '08f', spot: 'Freshwater' };
    if (fish === 'whale') return { name: 'Whale', rarity: 'Epic', color: '80f', spot: 'Freshwater' };
    if (fish === 'kraken') return { name: 'Kraken', rarity: 'Legendary', color: 'f80', spot: 'Freshwater' };
    
    // Deep ocean fish
    if (fish === 'sardine') return { name: 'Sardine', rarity: 'Common', color: 'fff', spot: 'Deep Ocean' };
    if (fish === 'tuna') return { name: 'Tuna', rarity: 'Uncommon', color: '0f0', spot: 'Deep Ocean' };
    if (fish === 'marlin') return { name: 'Marlin', rarity: 'Rare', color: '08f', spot: 'Deep Ocean' };
    if (fish === 'megalodon') return { name: 'Megalodon', rarity: 'Epic', color: '80f', spot: 'Deep Ocean' };
    if (fish === 'leviathan') return { name: 'Leviathan', rarity: 'Legendary', color: 'f80', spot: 'Deep Ocean' };
    
    // Tropical reef fish
    if (fish === 'clownfish') return { name: 'Clownfish', rarity: 'Common', color: 'fff', spot: 'Tropical Reef' };
    if (fish === 'angelfish') return { name: 'Angelfish', rarity: 'Uncommon', color: '0f0', spot: 'Tropical Reef' };
    if (fish === 'lionfish') return { name: 'Lionfish', rarity: 'Rare', color: '08f', spot: 'Tropical Reef' };
    if (fish === 'manta ray') return { name: 'Manta Ray', rarity: 'Epic', color: '80f', spot: 'Tropical Reef' };
    if (fish === 'sea dragon') return { name: 'Sea Dragon', rarity: 'Legendary', color: 'f80', spot: 'Tropical Reef' };
    
    // Arctic fish
    if (fish === 'icefish') return { name: 'Icefish', rarity: 'Common', color: 'fff', spot: 'Arctic' };
    if (fish === 'arctic char') return { name: 'Arctic Char', rarity: 'Uncommon', color: '0f0', spot: 'Arctic' };
    if (fish === 'beluga') return { name: 'Beluga', rarity: 'Rare', color: '08f', spot: 'Arctic' };
    if (fish === 'narwhal') return { name: 'Narwhal', rarity: 'Epic', color: '80f', spot: 'Arctic' };
    if (fish === 'frost kraken') return { name: 'Frost Kraken', rarity: 'Legendary', color: 'f80', spot: 'Arctic' };
    
    return null;
  }

  getResourceColor(resourceName: string): string {
    const resource = resourceName.toLowerCase();
    
    // Mining resources - handle both old and new formats
    if (resource === 'copper' || resource === 'copper ore') return 'fff';     // White (Common)
    if (resource === 'iron' || resource === 'iron ore') return '0f0';         // Green (Uncommon)
    if (resource === 'gold' || resource === 'gold ore') return '08f';         // Blue (Rare)
    if (resource === 'obsidian' || resource === 'obsidian ore') return '80f'; // Purple (Epic)
    if (resource === 'diamond' || resource === 'diamond ore') return 'f80';   // Orange (Legendary)
    
    // Fishing resources - Original freshwater fish
    if (resource === 'gup') return 'fff';    // White (Common)
    if (resource === 'cod') return '0f0';    // Green (Uncommon)
    if (resource === 'shark') return '08f';  // Blue (Rare)
    if (resource === 'whale') return '80f';  // Purple (Epic)
    if (resource === 'kraken') return 'f80'; // Orange (Legendary)
    
    // Fishing resources - Deep ocean fish
    if (resource === 'sardine') return 'fff';    // White (Common)
    if (resource === 'tuna') return '0f0';       // Green (Uncommon)
    if (resource === 'marlin') return '08f';     // Blue (Rare)
    if (resource === 'megalodon') return '80f';  // Purple (Epic)
    if (resource === 'leviathan') return 'f80';  // Orange (Legendary)
    
    // Fishing resources - Tropical reef fish
    if (resource === 'clownfish') return 'fff';  // White (Common)
    if (resource === 'angelfish') return '0f0';  // Green (Uncommon)
    if (resource === 'lionfish') return '08f';   // Blue (Rare)
    if (resource === 'manta ray') return '80f';  // Purple (Epic)
    if (resource === 'sea dragon') return 'f80'; // Orange (Legendary)
    
    // Fishing resources - Arctic fish
    if (resource === 'icefish') return 'fff';      // White (Common)
    if (resource === 'arctic char') return '0f0';  // Green (Uncommon)
    if (resource === 'beluga') return '08f';       // Blue (Rare)
    if (resource === 'narwhal') return '80f';      // Purple (Epic)
    if (resource === 'frost kraken') return 'f80'; // Orange (Legendary)
    
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
    
    // Normalize the item name before adding to inventory
    const normalizedItem = this.normalizeItemName(item);
    player.inventory.push(normalizedItem);
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
    } else if (trigger.type === 'quest') {
      interactionType = 'talking to questgiver';
      // Extract questgiver name from trigger message (quest ID)
      const questId = trigger.message;
      const quest = this.getQuestById(questId);
      nodeName = quest ? quest.questgiver.name.toLowerCase() : 'questgiver';
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
          
          
          // Determine clicks required based on fishing level and spot type
          const currentFishingSpotType = trigger.fishingSpotType || 'spot'; // Default to original spot if not set
          let representativeFish = 'gup'; // Default to gup for original spot
          
          if (currentFishingSpotType === 'spot_2') {
            representativeFish = 'sardine'; // Use sardine for deep ocean spot
          } else if (currentFishingSpotType === 'spot_3') {
            representativeFish = 'clownfish'; // Use clownfish for tropical reef spot
          } else if (currentFishingSpotType === 'spot_4') {
            representativeFish = 'icefish'; // Use icefish for arctic spot
          }
          
          const fishingClicksRequired = this.getFishingClicksRequired(fishingLevel, representativeFish);
          
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
          
          // Fishing complete - determine what was caught based on fishing spot type
          let fishResult;
          const finalFishingSpotType = trigger.fishingSpotType || 'spot'; // Default to original spot if not set
          
          console.log(`[Hoopla RPG] DEBUG: Fishing complete - Spot type: "${finalFishingSpotType}", Used bait: ${usedBait}, Fishing level: ${fishingLevel}`);
          console.log(`[Hoopla RPG] DEBUG: Trigger fishingSpotType property:`, trigger.fishingSpotType);
          console.log(`[Hoopla RPG] DEBUG: Trigger message:`, trigger.message);
          
          if (finalFishingSpotType === 'spot') {
            // Original freshwater fishing spot
            console.log(`[Hoopla RPG] DEBUG: Using original fish generation (freshwater)`);
            fishResult = usedBait ? this.getRandomFishType(fishingLevel, true) : this.getRandomFishType(fishingLevel);
          } else if (finalFishingSpotType === 'spot_2') {
            // Deep ocean fishing spot
            console.log(`[Hoopla RPG] DEBUG: Using deep ocean fish generation`);
            fishResult = usedBait ? this.getRandomFishType_2(fishingLevel, true) : this.getRandomFishType_2(fishingLevel);
          } else if (finalFishingSpotType === 'spot_3') {
            // Tropical reef fishing spot
            console.log(`[Hoopla RPG] DEBUG: Using tropical reef fish generation`);
            fishResult = usedBait ? this.getRandomFishType_3(fishingLevel, true) : this.getRandomFishType_3(fishingLevel);
          } else if (finalFishingSpotType === 'spot_4') {
            // Arctic fishing spot
            console.log(`[Hoopla RPG] DEBUG: Using arctic fish generation`);
            fishResult = usedBait ? this.getRandomFishType_4(fishingLevel, true) : this.getRandomFishType_4(fishingLevel);
          } else {
            // Fallback to original fishing spot
            console.log(`[Hoopla RPG] DEBUG: Using fallback fish generation (unknown spot type: ${finalFishingSpotType})`);
            fishResult = usedBait ? this.getRandomFishType(fishingLevel, true) : this.getRandomFishType(fishingLevel);
          }
          
          console.log(`[Hoopla RPG] DEBUG: Fish result:`, fishResult);
          
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
            if (fishType.toLowerCase() === 'kraken' || fishType.toLowerCase() === 'leviathan' || 
                fishType.toLowerCase() === 'sea dragon' || fishType.toLowerCase() === 'frost kraken') {
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
          if (fishType.toLowerCase() === 'kraken' || fishType.toLowerCase() === 'leviathan' || 
              fishType.toLowerCase() === 'sea dragon' || fishType.toLowerCase() === 'frost kraken') {
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
          
          // Add item based on type
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
          } else if (buyType === 'rpg_buy_saber') {
            // Give the player a Sabre item using the giveItem method
            const player = this.omegga.getPlayer(playerId);
            if (player) {
              player.giveItem('Weapon_Sabre');
            }
            
            const newCurrency = await this.currency.getCurrency(playerId);
            const formattedCurrency = await this.currency.format(newCurrency);
            
            const buyMessage = `Purchased <color="fff">[Sabre]</color> for ${await this.currency.format(itemPrice)}! You now have ${formattedCurrency}.`;
            this.omegga.middlePrint(playerId, buyMessage);
            
            return { 
              success: true, 
              message: buyMessage,
              reward: { 
                type: 'buy', 
                item: 'Sabre',
                price: itemPrice,
                newCurrency: formattedCurrency
              }
            };
          } else {
            const unknownMessage = `Unknown item to buy: ${buyType}`;
            this.omegga.middlePrint(playerId, unknownMessage);
            return { success: false, message: unknownMessage };
          }

        case 'quest':
          // Handle quest interactions
          const questPlayer = await this.getPlayerData({ id: playerId });
          let questId = trigger.message; // Quest ID is stored in the message
          
          // Handle legacy quest ID - redirect to first quest in chain
          if (questId === 'john_brickington') {
            questId = 'john_brickington_1';
          } else if (questId === 'frank_bricktavious') {
            questId = 'frank_bricktavious_1';
          } else if (questId === 'emmet_brickingway') {
            questId = 'emmet_brickingway_1';
          }
          
          // Determine which quest the player should be interacting with
          // Always start with the first quest in the chain and work sequentially
          if (questPlayer.quests) {
            // Determine which quest chain to use based on the original quest ID
            let questChain: string[] = [];
            if (trigger.message === 'john_brickington' || questId.startsWith('john_brickington_')) {
              questChain = ['john_brickington_1', 'john_brickington_2', 'john_brickington_3', 'john_brickington_4', 'john_brickington_5'];
            } else if (trigger.message === 'frank_bricktavious' || questId.startsWith('frank_bricktavious_')) {
              questChain = ['frank_bricktavious_1', 'frank_bricktavious_2', 'frank_bricktavious_3', 'frank_bricktavious_4', 'frank_bricktavious_5'];
            } else if (trigger.message === 'emmet_brickingway' || questId.startsWith('emmet_brickingway_')) {
              questChain = ['emmet_brickingway_1'];
            }
            
            // Find the first quest that is not completed
            for (const chainQuestId of questChain) {
              const questState = questPlayer.quests[chainQuestId];
              if (!questState || questState.status !== 'completed') {
                questId = chainQuestId;
                break;
              }
            }
          }
          
          const quest = this.getQuestById(questId);
          
          if (!quest) {
            const noQuestMessage = "Quest not found!";
            this.omegga.whisper(playerId, noQuestMessage);
            return { success: false, message: noQuestMessage };
          }
          
          // Handle step-by-step quest interactions
          const currentQuest = questPlayer.quests?.[questId];
          if (!currentQuest) {
            // First time starting this quest - Step 1: Show greeting
            if (!questPlayer.quests) {
              questPlayer.quests = {};
            }
            questPlayer.quests[questId] = {
              questId: quest.id,
              status: 'in_progress',
              requirements: quest.requirements,
              completedRequirements: [],
              interactionStep: 1
            };
            await this.setPlayerData({ id: playerId }, questPlayer);
            
            const greetingMessage = `<color="ff0">${quest.questgiver.name}</color>: "${quest.questgiver.greeting}"`;
            this.sendLongMessage(playerId, greetingMessage);
            return { success: true, message: greetingMessage };
          }
          
          // Handle existing quest based on interaction step
          switch (currentQuest.interactionStep) {
            case 1:
              // Step 2: Show quest explanation
              currentQuest.interactionStep = 2;
              await this.setPlayerData({ id: playerId }, questPlayer);
              
              const questExplanationMessage = `<color="ff0">${quest.questgiver.name}</color>: "${quest.questgiver.questExplanation}"`;
              this.sendLongMessage(playerId, questExplanationMessage);
              return { success: true, message: questExplanationMessage };
              
            case 2:
              // Step 3: Check requirements and attempt completion
              const requirementCheck = this.checkQuestRequirements(questPlayer, quest);
              
              if (requirementCheck.completed) {
                // Complete the quest
                await this.completeQuest(playerId, quest);
                currentQuest.status = 'completed';
                currentQuest.interactionStep = 3;
                await this.setPlayerData({ id: playerId }, questPlayer);
                
                const completionMessage = `<color="ff0">${quest.questgiver.name}</color>: "${quest.questgiver.completionMessage}"`;
                this.sendLongMessage(playerId, completionMessage);
                
                // Format and send rewards message separately
                const formattedItems = quest.rewards.items ? quest.rewards.items.map(item => `<color="fff">[${item}]</color>`).join(', ') : '';
                const formattedCurrency = await this.currency.format(quest.rewards.currency);
                const rewardMessage = `Quest completed! Rewards: <color="ff0">${quest.rewards.xp} XP</color>, <color="0f0">${formattedCurrency}</color>${formattedItems ? `, ${formattedItems}` : ''}`;
                this.omegga.whisper(playerId, rewardMessage);
                
                return { success: true, message: completionMessage };
              } else {
                // Show reminder
                const reminderMessage = `<color="ff0">${quest.questgiver.name}</color>: "${quest.questgiver.reminderMessage}"`;
                this.sendLongMessage(playerId, reminderMessage);
                return { success: true, message: reminderMessage };
              }
              
            case 3:
              // Step 4: Check for next quest or show completion message
              const nextQuestId = this.getNextQuestInChain(questId);
              if (nextQuestId) {
                const nextQuest = this.getQuestById(nextQuestId);
                if (nextQuest && !questPlayer.quests?.[nextQuestId]) {
                  // Show hint about next quest and advance to step 4
                  currentQuest.interactionStep = 4;
                  await this.setPlayerData({ id: playerId }, questPlayer);
                  
                  const nextQuestHint = `<color="ff0">New quest available!</color> Talk to ${quest.questgiver.name} again to start the next quest in the chain.`;
                  this.omegga.whisper(playerId, nextQuestHint);
                  return { success: true, message: nextQuestHint };
                } else if (nextQuest && questPlayer.quests?.[nextQuestId]) {
                  // Next quest already exists, show completion message
                  let allCompletedMessage = '';
                  if (quest.questgiver.name === 'John Brickington') {
                    allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "Yo you've literally completed my entire fish business empire! You're the GOAT of fishing, no cap. Thanks for everything, you're so real for that!"`;
                  } else if (quest.questgiver.name === 'Frank Bricktavious') {
                    allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "Well I'll be hornswoggled! You've helped me build the most magnificent monument this side of the Mississippi! You're a true mining legend, partner. Thanks for makin' an old miner's dreams come true!"`;
                  } else if (quest.questgiver.name === 'Emmet Brickingway') {
                    allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "You have done what I could not. You have brought my stories home. These boxes contain more than words - they contain truth, beauty, and the raw essence of what it means to be human. Thank you, friend. The stories will live again."`;
                  } else {
                    allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "Thank you for completing all my quests! You're truly amazing!"`;
                  }
                  this.sendLongMessage(playerId, allCompletedMessage);
                  return { success: true, message: allCompletedMessage };
                }
              } else {
                // No next quest - all quests completed
                let allCompletedMessage = '';
                if (quest.questgiver.name === 'John Brickington') {
                  allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "Yo you've literally completed my entire fish business empire! You're the GOAT of fishing, no cap. Thanks for everything, you're so real for that!"`;
                } else if (quest.questgiver.name === 'Frank Bricktavious') {
                  allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "Well I'll be hornswoggled! You've helped me build the most magnificent monument this side of the Mississippi! You're a true mining legend, partner. Thanks for makin' an old miner's dreams come true!"`;
                } else if (quest.questgiver.name === 'Emmet Brickingway') {
                  allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "You have done what I could not. You have brought my stories home. These boxes contain more than words - they contain truth, beauty, and the raw essence of what it means to be human. Thank you, friend. The stories will live again."`;
                } else {
                  allCompletedMessage = `<color="ff0">${quest.questgiver.name}</color>: "Thank you for completing all my quests! You're truly amazing!"`;
                }
                this.sendLongMessage(playerId, allCompletedMessage);
                return { success: true, message: allCompletedMessage };
              }
              break;
              
            case 4:
              // Step 5: Start the next quest in the chain
              const nextQuestId2 = this.getNextQuestInChain(questId);
              if (nextQuestId2) {
                const nextQuest = this.getQuestById(nextQuestId2);
                if (nextQuest && !questPlayer.quests?.[nextQuestId2]) {
                  // Start the next quest
                  questPlayer.quests[nextQuestId2] = {
                    questId: nextQuest.id,
                    status: 'in_progress',
                    requirements: nextQuest.requirements,
                    completedRequirements: [],
                    interactionStep: 1
                  };
                  await this.setPlayerData({ id: playerId }, questPlayer);
                  
                  const nextQuestGreeting = `<color="ff0">${nextQuest.questgiver.name}</color>: "${nextQuest.questgiver.greeting}"`;
                  this.sendLongMessage(playerId, nextQuestGreeting);
                  return { success: true, message: nextQuestGreeting };
                }
              }
              break;
              
            default:
              // Reset to step 1 if something goes wrong
              currentQuest.interactionStep = 1;
              await this.setPlayerData({ id: playerId }, questPlayer);
              const resetMessage = `<color="ff0">${quest.questgiver.name}</color>: "${quest.questgiver.greeting}"`;
              this.sendLongMessage(playerId, resetMessage);
              return { success: true, message: resetMessage };
          }

        case 'questitem':
          // Handle quest item collection
          const questItemPlayer = await this.getPlayerData({ id: playerId });
          const questItemType = trigger.message; // e.g., "brickingway_box"
          
          // Ensure collectedBy is an array (fix for existing triggers)
          if (!trigger.collectedBy || !Array.isArray(trigger.collectedBy)) {
            trigger.collectedBy = [];
          }
          
          // Check if this player has already collected this specific quest item
          if (trigger.collectedBy.includes(playerId)) {
            const alreadyCollectedMessage = `You have already collected this ${questItemType.replace('_', ' ')}.`;
            this.omegga.middlePrint(playerId, alreadyCollectedMessage);
            return { success: false, message: alreadyCollectedMessage };
          }
          
          // Add the quest item to player's inventory
          const questItemName = this.normalizeItemName(questItemType.replace('_', ' '));
          await this.addToInventory({ id: playerId }, questItemName);
          
          // Mark this item as collected by this player
          if (!trigger.collectedBy) {
            trigger.collectedBy = [];
          }
          trigger.collectedBy.push(playerId);
          
          // Save the updated trigger
          await this.createBrickTrigger(triggerId, trigger);
          
          // Get updated player data to show current count
          const questItemUpdatedPlayer = await this.getPlayerData({ id: playerId });
          const questItemCount = questItemUpdatedPlayer.inventory.filter(item => item === questItemName).length;
          
          // Show collection message
          const collectionMessage = `Collected <color="9B59B6">[${questItemName}]</color>! You now have <color="ff0">x${questItemCount}</color> in your inventory.`;
          this.omegga.middlePrint(playerId, collectionMessage);
          
          // Check if this completes any quest requirements
          if (questItemType === 'brickingway_box') {
            // Check Emmet Brickingway's quest
            const emmetQuest = this.getQuestById('emmet_brickingway_1');
            if (emmetQuest && questItemPlayer.quests?.['emmet_brickingway_1']) {
              const questCheck = this.checkQuestRequirements(questItemUpdatedPlayer, emmetQuest);
              if (questCheck.completed) {
                const questCompleteHint = `<color="0f0">Quest Update:</color> You have collected enough Brickingway Boxes! Return to Emmet Brickingway to complete your quest.`;
                this.omegga.whisper(playerId, questCompleteHint);
              } else {
                const questProgressHint = `<color="0f0">Quest Progress:</color> You have collected ${questItemCount}/10 Brickingway Boxes for Emmet Brickingway's quest.`;
                this.omegga.whisper(playerId, questProgressHint);
              }
            }
          }
          
          return { success: true, message: collectionMessage };

        case 'lava':
          // Handle lava damage
          const lavaPlayer = await this.getPlayerData({ id: playerId });
          if (!lavaPlayer) {
            return { success: false, message: "Player data not found!" };
          }

          // Check cooldown for lava damage
          const lavaNow = Date.now();
          const lavaLastUsed = trigger.lastUsed[playerId] || 0;
          if (lavaNow - lavaLastUsed < trigger.cooldown) {
            return { success: false, message: "Lava damage on cooldown!" };
          }

          // Update last used time
          trigger.lastUsed[playerId] = lavaNow;
          await this.setBrickTriggers(await this.getBrickTriggers());

          // Calculate damage
          const damageAmount = trigger.value || 25; // Default 25 damage
          const oldHealth = lavaPlayer.health || 100;
          const newHealth = Math.max(0, oldHealth - damageAmount);
          
          // Update player health
          lavaPlayer.health = newHealth;
          await this.setPlayerData({ id: playerId }, lavaPlayer);

          // Show damage message
          const damageMessage = `<color="ff4500">🔥 BURNING!</color> <color="f00">-${damageAmount}</color> damage! <color="0f0">Health: ${newHealth}/${lavaPlayer.maxHealth}</color>`;
          this.omegga.middlePrint(playerId, damageMessage);

          // Check if player died
          if (newHealth <= 0) {
            try {
              const player = this.omegga.getPlayer(playerId);
              if (player) {
                player.kill();
                const deathMessage = `<color="f00">💀 You died from burning in lava!</color>`;
                this.omegga.middlePrint(playerId, deathMessage);
                console.log(`[Hoopla RPG] ${player.name} died from lava damage!`);
              }
            } catch (error) {
              console.error(`[Hoopla RPG] Error killing player from lava:`, error);
            }
          }

          return { 
            success: true, 
            message: damageMessage,
            reward: { 
              type: 'lava_damage', 
              damage: damageAmount,
              newHealth: newHealth,
              maxHealth: lavaPlayer.maxHealth,
              died: newHealth <= 0
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
      
      // Count items by type for better display
      const itemCounts: { [key: string]: number } = {};
      for (const item of safeRpgData.inventory) {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
      }
      
      // Log full inventory to console with grouped items
      console.log(`[Hoopla RPG] Player ${player.name} full inventory:`);
      if (Object.keys(itemCounts).length === 0) {
        console.log(`[Hoopla RPG] Inventory is empty`);
      } else {
        Object.entries(itemCounts).forEach(([item, count]) => {
          console.log(`[Hoopla RPG] ${item} x${count}`);
        });
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
      
      // Freshwater fish (rpg_fishing_spot)
      this.omegga.whisper(speaker, `<color="0ff">--- Freshwater Fishing (rpg_fishing_spot) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Gup: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Cod: Uncommon (level 5+)</color>`);
      this.omegga.whisper(speaker, `<color="08f">Shark: Rare (level 10+)</color>`);
      this.omegga.whisper(speaker, `<color="80f">Whale: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Kraken: Legendary (level 20+)</color>`);
      
      // Deep ocean fish (rpg_fishing_spot_2)
      this.omegga.whisper(speaker, `<color="0ff">--- Deep Ocean Fishing (rpg_fishing_spot_2) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Sardine: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Tuna: Uncommon (level 5+)</color>`);
      this.omegga.whisper(speaker, `<color="08f">Marlin: Rare (level 10+)</color>`);
      this.omegga.whisper(speaker, `<color="80f">Megalodon: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Leviathan: Legendary (level 20+)</color>`);
      
      // Tropical reef fish (rpg_fishing_spot_3)
      this.omegga.whisper(speaker, `<color="0ff">--- Tropical Reef Fishing (rpg_fishing_spot_3) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Clownfish: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Angelfish: Uncommon (level 5+)</color>`);
      this.omegga.whisper(speaker, `<color="08f">Lionfish: Rare (level 10+)</color>`);
      this.omegga.whisper(speaker, `<color="80f">Manta Ray: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Sea Dragon: Legendary (level 20+)</color>`);
      
      // Arctic fish (rpg_fishing_spot_4)
      this.omegga.whisper(speaker, `<color="0ff">--- Arctic Fishing (rpg_fishing_spot_4) ---</color>`);
      this.omegga.whisper(speaker, `<color="fff">Icefish: Common (any level)</color>`);
      this.omegga.whisper(speaker, `<color="0f0">Arctic Char: Uncommon (level 5+)</color>`);
      this.omegga.whisper(speaker, `<color="08f">Beluga: Rare (level 10+)</color>`);
      this.omegga.whisper(speaker, `<color="80f">Narwhal: Epic (level 15+)</color>`);
      this.omegga.whisper(speaker, `<color="f80">Frost Kraken: Legendary (level 20+)</color>`);
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

    // RPG clear quest triggers command - clears only quest triggers
    this.omegga.on("cmd:rpgclearquests", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Clearing quest triggers...</color>`);

      try {
        const triggers = await this.getBrickTriggers();
        let questTriggerCount = 0;
        
        // Find and remove quest triggers
        for (const [triggerId, trigger] of Object.entries(triggers)) {
          if (trigger.type === 'quest') {
            delete triggers[triggerId];
            questTriggerCount++;
          }
        }
        
        await this.setBrickTriggers(triggers);

        this.omegga.whisper(speaker, `<color="0f0">Cleared ${questTriggerCount} quest triggers!</color>`);
        this.omegga.whisper(speaker, `<color="888">Click on quest bricks to recreate them.</color>`);
         
       } catch (error) {
         console.error(`[Hoopla RPG] Error clearing quest triggers:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to clear quest triggers: ${error.message}</color>`);
       }
    });

    // RPG reset quest progress command - clears only your own quest progress
    this.omegga.on("cmd:rpgresetquests", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="f00">Resetting your quest progress...</color>`);

      try {
        const playerData = await this.getPlayerData({ id: player.id });
        if (playerData && playerData.quests) {
          const questCount = Object.keys(playerData.quests).length;
          playerData.quests = {}; // Clear all quest progress and interaction steps
          await this.setPlayerData({ id: player.id }, playerData);
          
          this.omegga.whisper(speaker, `<color="0f0">Reset ${questCount} quests!</color>`);
          this.omegga.whisper(speaker, `<color="888">You can now start quests from the beginning.</color>`);
                 } else {
          this.omegga.whisper(speaker, `<color="888">No quest progress to reset.</color>`);
         }
         
       } catch (error) {
         console.error(`[Hoopla RPG] Error resetting quest progress:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to reset quest progress: ${error.message}</color>`);
       }
    });

    // Command to show all team names and indexes
    this.omegga.on("cmd:rpgteams", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      try {
        const minigames = await this.omegga.getMinigames();
        console.log(`[Hoopla RPG] Team information requested by ${speaker}:`);
        
        if (minigames.length === 0) {
          this.omegga.whisper(speaker, `<color="f80">No minigames found. Teams may not be available.</color>`);
          console.log(`[Hoopla RPG] No minigames found for team information`);
          return;
        }

        // Log all team information to console
        minigames.forEach((minigame, minigameIndex) => {
          console.log(`[Hoopla RPG] Minigame ${minigameIndex}: ${minigame.name} (${minigame.ruleset})`);
          if (minigame.teams && minigame.teams.length > 0) {
            minigame.teams.forEach((team, teamIndex) => {
              console.log(`[Hoopla RPG]   Team ${teamIndex}: "${team.name}" (${team.team}) - Color: [${team.color.join(', ')}] - Members: ${team.members.length}`);
            });
          } else {
            console.log(`[Hoopla RPG]   No teams found in this minigame`);
          }
        });

        // Send summary to player
        const totalTeams = minigames.reduce((sum, mg) => sum + (mg.teams?.length || 0), 0);
        this.omegga.whisper(speaker, `<color="0f0">Found ${minigames.length} minigame(s) with ${totalTeams} total teams. Check console for detailed team information.</color>`);
        
      } catch (error) {
        console.error(`[Hoopla RPG] Error getting team information:`, error);
        this.omegga.whisper(speaker, `<color="f00">Failed to get team information: ${error.message}</color>`);
      }
    });

    // Command to assign level 30 players to Flyer and MINIGAME LEAVER roles
    this.omegga.on("cmd:rpgassignlevel30roles", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Assigning level 30 players to Flyer and MINIGAME LEAVER roles...</color>`);

      try {
        const allPlayers = this.omegga.getPlayers();
        let assignedCount = 0;
        let errorCount = 0;

        for (const onlinePlayer of allPlayers) {
          try {
            const playerData = await this.getPlayerData({ id: onlinePlayer.id });
            if (playerData && playerData.level === 30) {
              this.omegga.writeln(`Chat.Command /grantRole "Flyer" "${onlinePlayer.name}"`);
              this.omegga.writeln(`Chat.Command /grantRole "MINIGAME LEAVER" "${onlinePlayer.name}"`);
              assignedCount++;
              console.log(`[Hoopla RPG] Assigned ${onlinePlayer.name} Flyer and MINIGAME LEAVER roles (level 30)`);
            }
          } catch (error) {
            console.error(`[Hoopla RPG] Error assigning roles to ${onlinePlayer.name}:`, error);
            errorCount++;
          }
        }

        this.omegga.whisper(speaker, `<color="0f0">Successfully assigned ${assignedCount} level 30 players to Flyer and MINIGAME LEAVER roles!</color>`);
        if (errorCount > 0) {
          this.omegga.whisper(speaker, `<color="f80">${errorCount} players had errors during role assignment.</color>`);
        }
         
       } catch (error) {
         console.error(`[Hoopla RPG] Error assigning level 30 players to roles:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to assign level 30 players to roles: ${error.message}</color>`);
       }
    });

    // Command to clean all player inventories (fix malformed item names)
    this.omegga.on("cmd:rpgcleaninventories", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      this.omegga.whisper(speaker, `<color="0ff">Cleaning all player inventories...</color>`);

      try {
        const allPlayers = this.omegga.getPlayers();
        let totalCleaned = 0;
        let totalPlayers = 0;
        let errorCount = 0;

        for (const onlinePlayer of allPlayers) {
          try {
            const result = await this.cleanPlayerInventory({ id: onlinePlayer.id });
            if (result.cleaned > 0) {
              totalCleaned += result.cleaned;
              console.log(`[Hoopla RPG] Cleaned ${result.cleaned} items from ${onlinePlayer.name}'s inventory`);
            }
            totalPlayers++;
          } catch (error) {
            console.error(`[Hoopla RPG] Error cleaning ${onlinePlayer.name}'s inventory:`, error);
            errorCount++;
          }
        }

        this.omegga.whisper(speaker, `<color="0f0">Inventory cleanup complete! Cleaned ${totalCleaned} malformed items from ${totalPlayers} players.</color>`);
        if (errorCount > 0) {
          this.omegga.whisper(speaker, `<color="f80">${errorCount} players had errors during inventory cleanup.</color>`);
        }
        console.log(`[Hoopla RPG] Inventory cleanup complete: ${totalCleaned} items cleaned from ${totalPlayers} players`);
         
       } catch (error) {
         console.error(`[Hoopla RPG] Error during inventory cleanup:`, error);
         this.omegga.whisper(speaker, `<color="f00">Failed to clean inventories: ${error.message}</color>`);
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
            "rpg", "rpginit", "rpghelp", "rpgclearall", "rpgcleartriggers", "rpgclearquests", "rpgresetquests", "rpgassignlevel30roles", "rpgteams", "rpgcleaninventories", "mininginfo", "fishinginfo", "rpgleaderboard"
          ] 
        };
  }

  async stop() {}
}

