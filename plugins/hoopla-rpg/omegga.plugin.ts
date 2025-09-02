import OmeggaPlugin, { OL, PS, PC } from "omegga";
import Currency from "./currency";

type PlayerId = { id: string };
type RPGPlayer = { 
  level: number; 
  experience: number; 
  health: number; 
  maxHealth: number;
  inventory: string[];
  nodesCollected: string[]; // Track which nodes the player has discovered
};

type BrickTrigger = {
  id: string;
  type: 'xp' | 'currency' | 'item' | 'heal';
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
    return { 
      level: this.config.startingLevel, 
      experience: 0, 
      health: this.config.startingHealth, 
      maxHealth: this.config.startingHealth,
      inventory: [],
      nodesCollected: []
    };
  }

  async getPlayerData({ id }: PlayerId): Promise<RPGPlayer> {
    return (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
  }

  async setPlayerData({ id }: PlayerId, data: RPGPlayer) {
    await this.store.set("rpg_" + id, data);
  }

  async updatePlayerData({ id }: PlayerId, data: Partial<RPGPlayer>) {
    const baseData = (await this.store.get("rpg_" + id)) ?? this.defaultPlayer();
    await this.store.set("rpg_" + id, { ...baseData, ...data });
  }

  async addExperience({ id }: PlayerId, amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    const player = await this.getPlayerData({ id });
    
    // Ensure all required properties exist with fallbacks
    if (player.level === undefined) player.level = this.config.startingLevel;
    if (player.experience === undefined) player.experience = 0;
    if (player.health === undefined) player.health = this.config.startingHealth;
    if (player.maxHealth === undefined) player.maxHealth = this.config.startingHealth;
    
    const oldLevel = player.level;
    
    player.experience += amount;
    
    // Simple leveling system: every 100 XP = 1 level
    const newLevel = Math.floor(player.experience / 100) + this.config.startingLevel;
    player.level = newLevel;
    
    // Increase max health with level
    if (newLevel > oldLevel) {
      player.maxHealth += 10;
      player.health = player.maxHealth; // Full heal on level up
    }
    
    await this.setPlayerData({ id }, player);
    
    return { 
      leveledUp: newLevel > oldLevel, 
      newLevel: newLevel 
    };
  }

  // Calculate XP needed to reach next level
  getXPForNextLevel(currentLevel: number): number {
    return (currentLevel - this.config.startingLevel + 1) * 100;
  }

  // Calculate XP progress toward next level
  getXPProgress(currentXP: number, currentLevel: number): { current: number; needed: number; progress: number } {
    const xpForCurrentLevel = (currentLevel - this.config.startingLevel) * 100;
    const xpForNextLevel = this.getXPForNextLevel(currentLevel);
    const xpInCurrentLevel = currentXP - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - currentXP;
    const progress = Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
    
    return {
      current: xpInCurrentLevel,
      needed: xpForNextLevel - xpForCurrentLevel,
      progress: progress
    };
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

  async triggerBrickAction(playerId: string, triggerId: string): Promise<{ success: boolean; message: string; reward?: any }> {
    const triggers = await this.getBrickTriggers();
    const trigger = triggers[triggerId];
    
    if (!trigger) {
      return { success: false, message: "❌ Trigger not found!" };
    }

    // Check cooldown
    const now = Date.now();
    const lastUsed = trigger.lastUsed[playerId] || 0;
    if (now - lastUsed < trigger.cooldown) {
      const remaining = Math.ceil((trigger.cooldown - (now - lastUsed)) / 1000);
      return { success: false, message: `⏰ Cooldown active! Try again in ${remaining} seconds.` };
    }

    // Update last used time
    trigger.lastUsed[playerId] = now;
    await this.setBrickTriggers(triggers);

    // Track node discovery for the player
    await this.addNodeToCollection({ id: playerId }, triggerId);

    // Process the trigger
    try {
      switch (trigger.type) {
        case 'xp':
          const xpResult = await this.addExperience({ id: playerId }, trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', trigger.value.toString()),
            reward: { type: 'xp', amount: trigger.value, leveledUp: xpResult.leveledUp, newLevel: xpResult.newLevel }
          };

        case 'currency':
          await this.currency.add(playerId, "currency", trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', (await this.currency.format(trigger.value))),
            reward: { type: 'currency', amount: trigger.value }
          };

        case 'item':
          await this.addToInventory({ id: playerId }, trigger.message);
          return { 
            success: true, 
            message: `📦 Found ${trigger.message}!`,
            reward: { type: 'item', item: trigger.message }
          };

        case 'heal':
          const healResult = await this.healPlayer({ id: playerId }, trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', trigger.value.toString()),
            reward: { type: 'heal', amount: trigger.value, healed: healResult.healed }
          };

        default:
                 return { success: false, message: "❌ Unknown trigger type!" };
       }
     } catch (error) {
       console.error(`Error processing brick trigger ${triggerId}:`, error);
       return { success: false, message: "❌ Error processing trigger!" };
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

  // Auto-convert selected bricks to nodes (using mirror plugin logic)
  async convertSelectedBricksToNode(speaker: string, nodeType: string, rewardType: 'xp' | 'currency' | 'item' | 'heal', rewardValue: number, cooldown: number, message: string): Promise<void> {
    try {
      const player = this.omegga.getPlayer(speaker);
      if (!player) {
        throw new Error("Player not found");
      }

      // Get the player's selected bricks using getTemplateBoundsData (mirror plugin method)
      let saveData = null;
      
      try {
        // Call getTemplateBoundsData() - this should return the selected brick data
        saveData = await player.getTemplateBoundsData();
        console.log(`[Hoopla RPG] getTemplateBoundsData result:`, saveData);
        console.log(`[Hoopla RPG] saveData type:`, typeof saveData);
        console.log(`[Hoopla RPG] saveData keys:`, saveData ? Object.keys(saveData) : 'null');
        
        // Check if we got valid data structure
        if (saveData && typeof saveData === 'object') {
          console.log(`[Hoopla RPG] Data structure:`, {
            hasBricks: !!saveData.bricks,
            bricksLength: saveData.bricks ? saveData.bricks.length : 0,
            hasBrickAssets: !!saveData.brick_assets,
            brickAssetsLength: saveData.brick_assets ? saveData.brick_assets.length : 0
          });
        }
        
      } catch (error) {
        console.log(`[Hoopla RPG] getTemplateBoundsData failed:`, error);
        throw new Error(`Failed to get selected bricks: ${error.message}`);
      }
      
      // Validate that we have the expected data structure
      if (!saveData || !saveData.bricks || !Array.isArray(saveData.bricks) || saveData.bricks.length === 0) {
        throw new Error("No bricks selected! Use the in-game selector tool to select bricks first.");
      }

      // Generate unique ID for the node
      const nodeId = `${nodeType}_${Date.now()}`;
      
             // Extract positions from selected bricks (exactly like mirror plugin)
       const positions: Array<{ x: number; y: number; z: number }> = [];
       
       console.log(`[Hoopla RPG] Processing ${saveData.bricks.length} bricks...`);
       
       for (const brick of saveData.bricks) {
         console.log(`[Hoopla RPG] Brick data:`, {
           hasPosition: !!brick.position,
           positionType: typeof brick.position,
           positionLength: brick.position ? brick.position.length : 0,
           position: brick.position
         });
         
         if (brick.position && Array.isArray(brick.position) && brick.position.length >= 3) {
           const pos = {
             x: brick.position[0],
             y: brick.position[1], 
             z: brick.position[2]
           };
           positions.push(pos);
           console.log(`[Hoopla RPG] Added position:`, pos);
         } else {
           console.log(`[Hoopla RPG] Skipping brick with invalid position:`, brick);
         }
       }

       console.log(`[Hoopla RPG] Total positions extracted:`, positions.length);
       
       if (positions.length === 0) {
         throw new Error("Could not extract brick positions from selection. Brick data structure may be different than expected.");
       }

      // Create the trigger with brick positions
      const trigger: BrickTrigger = {
        id: nodeId,
        type: rewardType,
        value: rewardValue,
        cooldown: cooldown,
        lastUsed: {},
        message: message,
        triggerType: 'click',
        brickPositions: positions
      };

      // Save the trigger
      await this.createBrickTrigger(nodeId, trigger);
      
      // Notify the player
      this.omegga.whisper(speaker, `<color="0f0">✅ Created ${nodeType} node!</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Node ID: ${nodeId}</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Type: ${rewardType} (${rewardValue})</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Cooldown: ${cooldown}ms</color>`);
      this.omegga.whisper(speaker, `<color="0ff">Bricks: ${positions.length} selected</color>`);
      this.omegga.whisper(speaker, `<color="f0f">🎯 Players can now click these bricks to activate!</color>`);
      
    } catch (error) {
      this.omegga.whisper(speaker, `<color="f00">❌ Failed to create node: ${error}</color>`);
    }
  }

   async setRegionBounds(triggerId: string, min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): Promise<void> {
     const triggers = await this.getBrickTriggers();
     if (triggers[triggerId]) {
       triggers[triggerId].regionBounds = { min, max };
       triggers[triggerId].triggerType = 'region';
       await this.setBrickTriggers(triggers);
     }
   }

   async setProximityTrigger(triggerId: string, radius: number): Promise<void> {
     const triggers = await this.getBrickTriggers();
     if (triggers[triggerId]) {
       triggers[triggerId].proximityRadius = radius;
       triggers[triggerId].triggerType = 'proximity';
       await this.setBrickTriggers(triggers);
     }
   }

   isPlayerInRegion(playerPos: { x: number; y: number; z: number }, region: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): boolean {
     return playerPos.x >= region.min.x && playerPos.x <= region.max.x &&
            playerPos.y >= region.min.y && playerPos.y <= region.max.y &&
            playerPos.z >= region.min.z && playerPos.z <= region.max.z;
   }

   getDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
     const dx = pos1.x - pos2.x;
     const dy = pos1.y - pos2.y;
     const dz = pos1.z - pos2.z;
     return Math.sqrt(dx * dx + dy * dy + dz * dz);
   }

   async checkBrickTriggers(player: any, playerPos: { x: number; y: number; z: number }): Promise<void> {
     const triggers = await this.getBrickTriggers();
     
     for (const [triggerId, trigger] of Object.entries(triggers)) {
       try {
         switch (trigger.triggerType) {
           case 'click':
             // Click triggers are handled by brick events
             break;
             
           case 'region':
             if (trigger.regionBounds && this.isPlayerInRegion(playerPos, trigger.regionBounds)) {
               const result = await this.triggerBrickAction(player.id, triggerId);
               if (result.success) {
                 this.omegga.whisper(player.name, `<color="0f0">${result.message}</>`);
               }
             }
             break;
             
           case 'proximity':
             if (trigger.proximityRadius && trigger.brickPositions) {
               for (const brickPos of trigger.brickPositions) {
                 if (this.getDistance(playerPos, brickPos) <= trigger.proximityRadius) {
                   const result = await this.triggerBrickAction(player.id, triggerId);
                   if (result.success) {
                     this.omegga.whisper(player.name, `<color="0f0">${result.message}</>`);
                   }
                   break; // Only trigger once per proximity check
                 }
               }
             }
             break;
         }
       } catch (error) {
         console.error(`Error checking brick trigger ${triggerId}:`, error);
       }
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

    // Register commands
    this.omegga.on("cmd:rpg", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const rpgData = await this.getPlayerData(player);
      const currency = await this.currency.getCurrency(player.id);
      const formattedCurrency = await this.currency.format(currency);
      
      // Ensure level exists before calculating XP progress
      const safeLevel = rpgData.level ?? 1;
      const safeExperience = rpgData.experience ?? 0;
      const xpProgress = this.getXPProgress(safeExperience, safeLevel);

                   // Ensure all required properties exist with fallbacks
      const safeRpgData = {
        level: rpgData.level ?? 1,
        experience: rpgData.experience ?? 0,
        health: rpgData.health ?? 100,
        maxHealth: rpgData.maxHealth ?? 100,
        inventory: rpgData.inventory ?? [],
        nodesCollected: rpgData.nodesCollected ?? []
      };
      
      const nodeCount = safeRpgData.nodesCollected.length;
      const inventoryCount = safeRpgData.inventory.length;
      
      this.omegga.whisper(speaker, 
        `=== RPG Stats ===\n` +
        `Level: <color="ff0">${safeRpgData.level}</>\n` +
        `Experience: <color="0ff">${safeRpgData.experience}</>\n` +
        `Level Progress: <color="ff0">${xpProgress.current}/${xpProgress.needed} XP (${xpProgress.progress.toFixed(1)}%)</>\n` +
        `Health: <color="f00">${safeRpgData.health}</>/<color="f00">${safeRpgData.maxHealth}</>\n` +
        `Currency: <color="0f0">${formattedCurrency}</>\n` +
        `Inventory: <color="f0f">${inventoryCount} items</>\n` +
        `Nodes Discovered: <color="f0f">${nodeCount}</>`
      );
    });

    this.omegga.on("cmd:xp", async (speaker: string, amount: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const xpAmount = parseInt(amount) || 10;
      const result = await this.addExperience(player, xpAmount);
      
      if (result.leveledUp) {
        this.omegga.whisper(speaker, 
          `<color="0f0">🎉 LEVEL UP! You are now level ${result.newLevel}!</>`
        );
      } else {
        this.omegga.whisper(speaker, 
          `<color="0ff">+${xpAmount} XP gained! Current XP: ${(await this.getPlayerData(player)).experience}</>`
        );
      }
    });

    this.omegga.on("cmd:heal", async (speaker: string, amount: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const healAmount = parseInt(amount) || 20;
      const result = await this.healPlayer(player, healAmount);
      
      this.omegga.whisper(speaker, 
        `<color="0f0">💚 Healed ${result.healed} HP! Current Health: ${result.newHealth}</>`
      );
    });

    this.omegga.on("cmd:additem", async (speaker: string, item: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      if (!item) {
        this.omegga.whisper(speaker, `<color="f00">Please specify an item name!</>`);
        return;
      }

      const inventory = await this.addToInventory(player, item);
      this.omegga.whisper(speaker, 
        `<color="0f0">📦 Added ${item} to inventory! Total items: ${inventory.length}</>`
      );
    });

    this.omegga.on("cmd:removeitem", async (speaker: string, item: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      if (!item) {
        this.omegga.whisper(speaker, `<color="f00">Please specify an item name!</>`);
        return;
      }

      const removed = await this.removeFromInventory(player, item);
      if (removed) {
        this.omegga.whisper(speaker, `<color="0f0">🗑️ Removed ${item} from inventory!</>`);
      } else {
        this.omegga.whisper(speaker, `<color="f00">❌ Item ${item} not found in inventory!</>`);
      }
    });

    this.omegga.on("cmd:inventory", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const rpgData = await this.getPlayerData(player);
      const safeInventory = rpgData.inventory ?? [];
      
      if (safeInventory.length === 0) {
        this.omegga.whisper(speaker, `<color="f0f">📦 Your inventory is empty!</>`);
      } else {
        this.omegga.whisper(speaker, 
          `<color="f0f">📦 Inventory (${safeInventory.length} items):\n` +
          `${safeInventory.join(", ")}</>`
        );
      }
    });

    // Currency integration commands
    this.omegga.on("cmd:balance", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const currency = await this.currency.getCurrency(player.id);
      const formattedCurrency = await this.currency.format(currency);
      
      this.omegga.whisper(speaker, 
        `<color="0f0">💰 Your balance: ${formattedCurrency}</>`
      );
    });

    // Automatic XP system - give 10 XP to all online players every minute
    console.log("Hoopla RPG: Starting automatic XP system (10 XP every minute)");
    setInterval(async () => {
      const onlinePlayers = this.omegga.getPlayers();
      
      if (onlinePlayers.length > 0) {
        console.log(`Hoopla RPG: Giving 10 XP to ${onlinePlayers.length} online players`);
      }
      
      for (const player of onlinePlayers) {
        try {
          const result = await this.addExperience(player, 10);
          const rpgData = await this.getPlayerData(player);
          const xpProgress = this.getXPProgress(rpgData.experience, rpgData.level);
          
          if (result.leveledUp) {
            this.omegga.whisper(player.name, 
              `<color="0f0">🎉 LEVEL UP! You are now level ${result.newLevel}!</>\n` +
              `<color="0ff">+10 XP gained! Current XP: ${rpgData.experience}</>`
            );
          } else {
            this.omegga.whisper(player.name, 
              `<color="0ff">+10 XP gained! Current XP: ${rpgData.experience}</>\n` +
              `<color="ff0">Level ${rpgData.level} Progress: ${xpProgress.current}/${xpProgress.needed} XP (${xpProgress.progress.toFixed(1)}%)</>`
            );
          }
        } catch (error) {
          console.error(`Failed to give XP to player ${player.name}:`, error);
        }
      }
    }, 60000); // 60000ms = 1 minute

    // Plugin interop system for brick triggers
    this.omegga.on("pluginInterop", async (event: string, from: string, args: any[]) => {
      if (event === "trigger") {
        const [playerId, triggerId] = args;
        if (!playerId || !triggerId) {
          return { error: "Missing playerId or triggerId" };
        }

        try {
          const result = await this.triggerBrickAction(playerId, triggerId);
          return result;
        } catch (error) {
          return { error: `Failed to trigger action: ${error}` };
        }
      } else if (event === "getPlayerData") {
        const [playerId] = args;
        if (!playerId) {
          return { error: "Missing playerId" };
        }

        try {
          const playerData = await this.getPlayerData({ id: playerId });
          return playerData;
        } catch (error) {
          return { error: `Failed to get player data: ${error}` };
        }
      } else if (event === "addExperience") {
        const [playerId, amount] = args;
        if (!playerId || !amount) {
          return { error: "Missing playerId or amount" };
        }

        try {
          const result = await this.addExperience({ id: playerId }, amount);
          return result;
        } catch (error) {
          return { error: `Failed to add experience: ${error}` };
        }
      } else if (event === "addCurrency") {
        const [playerId, amount] = args;
        if (!playerId || !amount) {
          return { error: "Missing playerId or amount" };
        }

        try {
          await this.currency.add(playerId, "currency", amount);
          return { success: true, message: `Added ${amount} currency` };
        } catch (error) {
          return { error: `Failed to add currency: ${error}` };
        }
      }

      return { error: `Unknown event: ${event}` };
    });

    this.omegga.on("cmd:addmoney", async (speaker: string, amount: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const moneyAmount = parseInt(amount) || 100;
      await this.currency.add(player.id, "currency", moneyAmount);
      
      this.omegga.whisper(speaker, 
        `<color="0f0">💰 Added ${await this.currency.format(moneyAmount)} to your balance!</>`
      );
    });

    this.omegga.on("cmd:spend", async (speaker: string, amount: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      const spendAmount = parseInt(amount) || 50;
      const currentCurrency = await this.currency.getCurrency(player.id);
      
      if (currentCurrency < spendAmount) {
        this.omegga.whisper(speaker, 
          `<color="f00">❌ Insufficient funds! You have ${await this.currency.format(currentCurrency)}</>`
        );
        return;
      }

      await this.currency.add(player.id, "currency", -spendAmount);
      
      this.omegga.whisper(speaker, 
        `<color="f00">💸 Spent ${await this.currency.format(spendAmount)}! New balance: ${await this.currency.getCurrencyFormatted(player.id)}</>`
      );
    });

    // Brick trigger management commands
    this.omegga.on("cmd:createtrigger", async (speaker: string, triggerId: string, type: string, value: string, cooldown: string, message: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      if (!triggerId || !type || !value || !cooldown || !message) {
        this.omegga.whisper(speaker, `<color="f00">Usage: /createtrigger <id> <type> <value> <cooldown_ms> <message></>`);
        this.omegga.whisper(speaker, `<color="f0f">Types: xp, currency, item, heal</>`);
        this.omegga.whisper(speaker, `<color="f0f">Example: /createtrigger mine_ore xp 25 5000 "Mined ore! +{value} XP"</>`);
        return;
      }

      const validTypes = ['xp', 'currency', 'item', 'heal'];
      if (!validTypes.includes(type)) {
        this.omegga.whisper(speaker, `<color="f00">Invalid type! Use: xp, currency, item, or heal</>`);
        return;
      }

      const numValue = parseInt(value);
      const numCooldown = parseInt(cooldown);
      
      if (isNaN(numValue) || isNaN(numCooldown)) {
        this.omegga.whisper(speaker, `<color="f00">Value and cooldown must be numbers!</>`);
        return;
      }

             const trigger: BrickTrigger = {
         id: triggerId,
         type: type as 'xp' | 'currency' | 'item' | 'heal',
         value: numValue,
         cooldown: numCooldown,
         lastUsed: {},
         message: message,
         triggerType: 'click' // Default to click-based triggers
       };

      try {
        await this.createBrickTrigger(triggerId, trigger);
        
        // Whisper to creator
        this.omegga.whisper(speaker, `<color="0f0">✅ Created brick trigger: ${triggerId}</>`);
        this.omegga.whisper(speaker, `<color="0ff">Type: ${type}, Value: ${value}, Cooldown: ${cooldown}ms</>`);
        this.omegga.whisper(speaker, `<color="0ff">Message: ${message}</>`);
        
        // Broadcast to all players about the new node
        const nodeType = type === 'xp' ? 'XP Node' : 
                        type === 'currency' ? 'Currency Node' : 
                        type === 'item' ? 'Item Node' : 'Healing Node';
        
        this.omegga.broadcast(`<color="0ff">🔮 New ${nodeType} discovered: <color="ff0">${triggerId}</color> by <color="f0f">${speaker}</color>!</color>`);
        this.omegga.broadcast(`<color="f0f">Players can now interact with this node to get rewards!</color>`);
        
      } catch (error) {
        this.omegga.whisper(speaker, `<color="f00">❌ Failed to create trigger: ${error}</>`);
      }
    });

    this.omegga.on("cmd:removetrigger", async (speaker: string, triggerId: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      if (!triggerId) {
        this.omegga.whisper(speaker, `<color="f00">Usage: /removetrigger <trigger_id></>`);
        return;
      }

      try {
        const removed = await this.removeBrickTrigger(triggerId);
        if (removed) {
          this.omegga.whisper(speaker, `<color="0f0">✅ Removed brick trigger: ${triggerId}</>`);
        } else {
          this.omegga.whisper(speaker, `<color="f00">❌ Trigger not found: ${triggerId}</>`);
        }
      } catch (error) {
        this.omegga.whisper(speaker, `<color="f00">❌ Failed to remove trigger: ${error}</>`);
      }
    });

    this.omegga.on("cmd:listtriggers", async (speaker: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      try {
        const triggers = await this.getBrickTriggers();
        if (Object.keys(triggers).length === 0) {
          this.omegga.whisper(speaker, `<color="f0f">📋 No brick triggers found.</>`);
          return;
        }

        this.omegga.whisper(speaker, `<color="f0f">📋 Brick Triggers:</>`);
        for (const [id, trigger] of Object.entries(triggers)) {
          this.omegga.whisper(speaker, 
            `<color="ff0">${id}</>: ${trigger.type} (${trigger.value}) - ${trigger.message}`
          );
        }
      } catch (error) {
        this.omegga.whisper(speaker, `<color="f00">❌ Failed to list triggers: ${error}</>`);
      }
    });

    this.omegga.on("cmd:testtrigger", async (speaker: string, triggerId: string) => {
      const player = this.omegga.getPlayer(speaker);
      if (!player) return;

      if (!triggerId) {
        this.omegga.whisper(speaker, `<color="f00">Usage: /testtrigger <trigger_id></>`);
        return;
      }

      try {
        const result = await this.triggerBrickAction(player.id, triggerId);
        if (result.success) {
          this.omegga.whisper(speaker, `<color="0f0">✅ ${result.message}</>`);
          if (result.reward) {
            this.omegga.whisper(speaker, `<color="0ff">Reward: ${JSON.stringify(result.reward)}</>`);
          }
        } else {
          this.omegga.whisper(speaker, `<color="f00">❌ ${result.message}</>`);
        }
      } catch (error) {
        this.omegga.whisper(speaker, `<color="f00">❌ Failed to test trigger: ${error}</>`);
             }
     });

     // Brick interaction event handlers
     this.omegga.on("brick", async (data: any) => {
       try {
         const { player, brick } = data;
         if (!player || !brick) return;

         const triggers = await this.getBrickTriggers();
         
         // Check for click-based triggers on this brick
         for (const [triggerId, trigger] of Object.entries(triggers)) {
           if (trigger.triggerType === 'click' && trigger.brickPositions) {
             for (const brickPos of trigger.brickPositions) {
               if (brickPos.x === brick.x && brickPos.y === brick.y && brickPos.z === brick.z) {
                 const result = await this.triggerBrickAction(player.id, triggerId);
                 if (result.success) {
                   this.omegga.whisper(player.name, `<color="0f0">${result.message}</>`);
                 }
                 break;
               }
             }
           }
         }
       } catch (error) {
         console.error("Error handling brick interaction:", error);
       }
     });

     // Player movement tracking for region and proximity triggers
     this.omegga.on("player:move", async (player: any, position: any) => {
       try {
         await this.checkBrickTriggers(player, position);
       } catch (error) {
         console.error("Error checking brick triggers on player move:", error);
       }
     });

     // Player join tracking for initial trigger checks
     this.omegga.on("player:join", async (player: any) => {
       try {
         const position = { x: 0, y: 0, z: 0 }; // Default spawn position
         await this.checkBrickTriggers(player, position);
       } catch (error) {
         console.error("Error checking brick triggers on player join:", error);
       }
     });

     // Brick interaction setup commands
     this.omegga.on("cmd:setbrickpos", async (speaker: string, triggerId: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       if (!triggerId) {
         this.omegga.whisper(speaker, `<color="f00">Usage: /setbrickpos <trigger_id></>`);
         this.omegga.whisper(speaker, `<color="f0f">Copy the bricks you want to trigger this action, then use this command!</>`);
         return;
       }

       try {
         const triggers = await this.getBrickTriggers();
         if (!triggers[triggerId]) {
           this.omegga.whisper(speaker, `<color="f00">❌ Trigger not found: ${triggerId}</>`);
           return;
         }

                   // For now, we'll use a placeholder approach since getClipboard isn't available
          // Players will need to manually specify coordinates
          this.omegga.whisper(speaker, `<color="f0f">📋 Manual brick setup required!</color>`);
          this.omegga.whisper(speaker, `<color="f0f">Current limitations:</color>`);
          this.omegga.whisper(speaker, `<color="f0f">• Brick selection API not yet available</color>`);
          this.omegga.whisper(speaker, `<color="f0f">• Use /setregion instead for area-based triggers</color>`);
          this.omegga.whisper(speaker, `<color="f0f">• Or manually specify coordinates with /setregion</color>`);
          this.omegga.whisper(speaker, `<color="f0f">Example: /setregion ${triggerId} 0 0 0 5 5 5</color>`);
          this.omegga.whisper(speaker, `<color="f0f">💡 Tip: Use quick commands like /miningnode iron instead!</color>`);
          return;

         // TODO: Implement proper clipboard integration when available
         // const clipboard = this.omegga.getClipboard(speaker);
         // if (!clipboard || clipboard.length === 0) {
         //   this.omegga.whisper(speaker, `<color="f00">❌ No bricks in clipboard! Copy some bricks first.</>`);
         //   return;
         // }
         // 
         // // Extract positions from clipboard
         // const positions = clipboard.map((brick: any) => ({
         //   x: brick.x,
         //   y: brick.y,
         //   z: brick.z
         // }));
         // 
         // await this.setBrickPositions(triggerId, positions);
         // this.omegga.whisper(speaker, `<color="0f0">✅ Set ${positions.length} brick positions for trigger: ${triggerId}</>`);
         // this.omegga.whisper(speaker, `<color="0ff">Trigger type: Click-based (interact with bricks)</>`);
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to set brick positions: ${error}</>`);
       }
     });

     this.omegga.on("cmd:setregion", async (speaker: string, triggerId: string, minX: string, minY: string, minZ: string, maxX: string, maxY: string, maxZ: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       if (!triggerId || !minX || !minY || !minZ || !maxX || !maxY || !maxZ) {
         this.omegga.whisper(speaker, `<color="f00">Usage: /setregion <trigger_id> <minX> <minY> <minZ> <maxX> <maxY> <maxZ></>`);
         this.omegga.whisper(speaker, `<color="f0f">Example: /setregion mine_area 0 0 0 10 10 10</>`);
         return;
       }

       try {
         const min = { x: parseInt(minX), y: parseInt(minY), z: parseInt(minZ) };
         const max = { x: parseInt(maxX), y: parseInt(maxY), z: parseInt(maxZ) };

         if (isNaN(min.x) || isNaN(min.y) || isNaN(min.z) || isNaN(max.x) || isNaN(max.y) || isNaN(max.z)) {
           this.omegga.whisper(speaker, `<color="f00">❌ All coordinates must be numbers!</>`);
           return;
         }

         await this.setRegionBounds(triggerId, min, max);
         this.omegga.whisper(speaker, `<color="0f0">✅ Set region bounds for trigger: ${triggerId}</>`);
         this.omegga.whisper(speaker, `<color="0ff">Trigger type: Region-based (enter area to activate)</>`);
         this.omegga.whisper(speaker, `<color="0ff">Bounds: (${min.x},${min.y},${min.z}) to (${max.x},${max.y},${max.z})</>`);
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to set region bounds: ${error}</>`);
       }
     });

     this.omegga.on("cmd:setproximity", async (speaker: string, triggerId: string, radius: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       if (!triggerId || !radius) {
         this.omegga.whisper(speaker, `<color="f00">Usage: /setproximity <trigger_id> <radius></>`);
         this.omegga.whisper(speaker, `<color="f0f">Example: /setproximity mine_ore 5</>`);
         return;
       }

       try {
         const numRadius = parseInt(radius);
         if (isNaN(numRadius) || numRadius <= 0) {
           this.omegga.whisper(speaker, `<color="f00">❌ Radius must be a positive number!</>`);
           return;
         }

         await this.setProximityTrigger(triggerId, numRadius);
         this.omegga.whisper(speaker, `<color="0f0">✅ Set proximity trigger for: ${triggerId}</>`);
         this.omegga.whisper(speaker, `<color="0ff">Trigger type: Proximity-based (within ${numRadius} blocks)</>`);
         this.omegga.whisper(speaker, `<color="f0f">Note: You still need to set brick positions with /setbrickpos!</>`);
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to set proximity trigger: ${error}</>`);
       }
     });

     this.omegga.on("cmd:getposition", async (speaker: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       try {
         // For now, we'll use a placeholder since getPlayerPosition isn't available
         this.omegga.whisper(speaker, `<color="f0f">📍 Position tracking not yet implemented</>`);
         this.omegga.whisper(speaker, `<color="f0f">Use /setregion with manual coordinates for now</>`);
         
         // TODO: Implement proper position tracking when available
         // const position = this.omegga.getPlayerPosition(speaker);
         // if (position) {
         //   this.omegga.whisper(speaker, `<color="0ff">📍 Your position: (${position.x}, ${position.y}, ${position.z})</>`);
         //   this.omegga.whisper(speaker, `<color="f0f">Use this for setting region bounds with /setregion</>`);
         // } else {
         //   this.omegga.whisper(speaker, `<color="f00">❌ Could not get your position!</>`);
         // }
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to get position: ${error}</>`);
       }
     });

     // Quick node creation commands (inspired by mirror plugin)
     this.omegga.on("cmd:miningnode", async (speaker: string, oreType: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

               if (!oreType) {
          this.omegga.whisper(speaker, `<color="f00">Usage: /miningnode <ore_type></color>`);
          this.omegga.whisper(speaker, `<color="f0f">Example: /miningnode iron</color>`);
          this.omegga.whisper(speaker, `<color="f0f">First select bricks with the in-game selector tool!</color>`);
          return;
        }

       try {
         // Use the actual brick selection integration
         await this.convertSelectedBricksToNode(
           speaker, 
           `mining_${oreType}`, 
           'item', 
           1, 
           60000, 
           `Mined ${oreType} ore! Found {value} ${oreType} resource`
         );
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to create mining node: ${error}</color>`);
       }
     });

     this.omegga.on("cmd:treasurechest", async (speaker: string, itemType: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

               if (!itemType) {
          this.omegga.whisper(speaker, `<color="f00">Usage: /treasurechest <item_type></color>`);
          this.omegga.whisper(speaker, `<color="f0f">Example: /treasurechest sword</color>`);
          this.omegga.whisper(speaker, `<color="f0f">First select bricks with the in-game selector tool!</color>`);
          return;
        }

       try {
         // Use the actual brick selection integration
         await this.convertSelectedBricksToNode(
           speaker, 
           `treasure_${itemType}`, 
           'item', 
           1, 
           120000, 
           `Found treasure! Got {value} ${itemType}`
         );
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to create treasure chest: ${error}</color>`);
       }
     });

     this.omegga.on("cmd:healthfountain", async (speaker: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       try {
         // Use the actual brick selection integration
         await this.convertSelectedBricksToNode(
           speaker, 
           'health_fountain', 
           'heal', 
           50, 
           60000, 
           'Refreshed! +{value} HP restored'
         );
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to create health fountain: ${error}</color>`);
       }
     });

     this.omegga.on("cmd:xpnode", async (speaker: string, amount: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

               if (!amount) {
          this.omegga.whisper(speaker, `<color="f00">Usage: /xpnode <amount></color>`);
          this.omegga.whisper(speaker, `<color="f0f">Example: /xpnode 25</color>`);
          this.omegga.whisper(speaker, `<color="f0f">First select bricks with the in-game selector tool!</color>`);
          return;
        }

       try {
         const xpAmount = parseInt(amount);
         if (isNaN(xpAmount) || xpAmount <= 0) {
           this.omegga.whisper(speaker, `<color="f00">❌ XP amount must be a positive number!</color>`);
           return;
         }

         // Use the actual brick selection integration
         await this.convertSelectedBricksToNode(
           speaker, 
           'xp_node', 
           'xp', 
           xpAmount, 
           30000, 
           `Gained {value} XP!`
         );
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to create XP node: ${error}</color>`);
       }
     });

     // Node collection commands
     this.omegga.on("cmd:nodes", async (speaker: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

             try {
        const rpgData = await this.getPlayerData(player);
        const safeNodesCollected = rpgData.nodesCollected ?? [];
        const nodeCount = safeNodesCollected.length;
        
        if (nodeCount === 0) {
          this.omegga.whisper(speaker, `<color="f0f">🔮 You haven't discovered any nodes yet!</color>`);
          this.omegga.whisper(speaker, `<color="f0f">Interact with brick triggers to start your collection!</color>`);
          return;
        }

        this.omegga.whisper(speaker, `<color="f0f">🔮 Your Node Collection (${nodeCount} discovered):</color>`);
        
        // Group nodes by type for better organization
        const nodeTypes: { [key: string]: string[] } = {};
        for (const nodeId of safeNodesCollected) {
          const trigger = (await this.getBrickTriggers())[nodeId];
          if (trigger) {
            const type = trigger.type;
            if (!nodeTypes[type]) nodeTypes[type] = [];
            nodeTypes[type].push(nodeId);
          }
        }

         // Display nodes grouped by type
         for (const [type, nodes] of Object.entries(nodeTypes)) {
           const typeName = type === 'xp' ? 'XP Nodes' : 
                           type === 'currency' ? 'Currency Nodes' : 
                           type === 'item' ? 'Item Nodes' : 'Healing Nodes';
           
           this.omegga.whisper(speaker, `<color="ff0">${typeName}:</color>`);
           for (const nodeId of nodes) {
             this.omegga.whisper(speaker, `  <color="0ff">• ${nodeId}</color>`);
         }
         }
         
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Failed to get node collection: ${error}</color>`);
       }
     });

     // Debug commands for brick interaction testing
     this.omegga.on("cmd:testevents", async (speaker: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       this.omegga.whisper(speaker, `<color="f0f">🧪 Testing event system...</color>`);
       
       // Test if basic events are working
       this.omegga.whisper(speaker, `<color="0ff">Testing whisper event...</color>`);
       
       // Test if we can get player data
       try {
         const rpgData = await this.getPlayerData(player);
         this.omegga.whisper(speaker, `<color="0f0">✅ Player data access working! Level: ${rpgData.level}</color>`);
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Player data access failed: ${error.message}</color>`);
       }

       // Test if we can get brick triggers
       try {
         const triggers = await this.getBrickTriggers();
         const triggerCount = Object.keys(triggers).length;
         this.omegga.whisper(speaker, `<color="0f0">✅ Brick triggers access working! Found ${triggerCount} triggers</color>`);
       } catch (error) {
         this.omegga.whisper(speaker, `<color="f00">❌ Brick triggers access failed: ${error.message}</color>`);
       }

       this.omegga.whisper(speaker, `<color="f0f">🧪 Event test complete! Check console for any errors</color>`);
     });

     this.omegga.on("cmd:debugbrick", async (speaker: string) => {
       const player = this.omegga.getPlayer(speaker);
       if (!player) return;

       this.omegga.whisper(speaker, `<color="f0f">🔍 Brick Debug Mode Enabled!</color>`);
       this.omegga.whisper(speaker, `<color="f0f">Now click on any brick to see debug output in console</color>`);
       this.omegga.whisper(speaker, `<color="f0f">Check the server console for detailed brick click data</color>`);
     });

     // Brick interaction event handlers - using correct 'interact' event from Omegga docs
     this.omegga.on("interact", async (data: any) => {
       console.log(`[Hoopla RPG] INTERACT EVENT FIRED:`, data);
       console.log(`[Hoopla RPG] Data type:`, typeof data);
       console.log(`[Hoopla RPG] Data keys:`, data ? Object.keys(data) : 'null');
       
       try {
         // Extract data according to Omegga documentation structure
         const { player, position, brick_asset } = data;
         console.log(`[Hoopla RPG] Player from data:`, player);
         console.log(`[Hoopla RPG] Position from data:`, position);
         console.log(`[Hoopla RPG] Brick asset:`, brick_asset);
         
         if (!player || !position) {
           console.log(`[Hoopla RPG] ❌ Missing player or position data`);
           return;
         }

         console.log(`[Hoopla RPG] ✅ Processing brick interaction for player: ${player.name} (${player.id})`);
         console.log(`[Hoopla RPG] Clicked position:`, position);

         const triggers = await this.getBrickTriggers();
         console.log(`[Hoopla RPG] Found ${Object.keys(triggers).length} total triggers`);
         
         // Check for click-based triggers on this brick
         for (const [triggerId, trigger] of Object.entries(triggers)) {
           console.log(`[Hoopla RPG] Checking trigger: ${triggerId}`);
           console.log(`[Hoopla RPG] Trigger type: ${trigger.triggerType}`);
           console.log(`[Hoopla RPG] Has brick positions: ${!!trigger.brickPositions}`);
           
           if (trigger.triggerType === 'click' && trigger.brickPositions) {
             console.log(`[Hoopla RPG] Trigger ${triggerId} has ${trigger.brickPositions.length} brick positions`);
             
             for (const brickPos of trigger.brickPositions) {
               console.log(`[Hoopla RPG] Comparing brick position:`, brickPos);
               console.log(`[Hoopla RPG] Clicked position:`, position);
               
               // Position is an array [x, y, z] according to Omegga docs
               if (brickPos.x === position[0] && brickPos.y === position[1] && brickPos.z === position[2]) {
                 console.log(`[Hoopla RPG] 🎯 MATCH FOUND! Triggering action for ${triggerId}`);
                 
                 const result = await this.triggerBrickAction(player.id, triggerId);
                 console.log(`[Hoopla RPG] Action result:`, result);
                 
                 if (result.success) {
                   this.omegga.whisper(player.name, `<color="0f0">${result.message}</color>`);
                   console.log(`[Hoopla RPG] ✅ Successfully triggered brick action!`);
                 } else {
                   console.log(`[Hoopla RPG] ❌ Brick action failed: ${result.message}`);
                 }
                 break;
               } else {
                 console.log(`[Hoopla RPG] ❌ Position mismatch`);
               }
             }
           }
         }
       } catch (error) {
         console.error(`[Hoopla RPG] ❌ Error handling brick interaction:`, error);
       }
     });

            return { 
         registeredCommands: [
           "rpg", "xp", "heal", "additem", "removeitem", 
           "inventory", "balance", "addmoney", "spend",
           "createtrigger", "removetrigger", "listtriggers", "testtrigger",
           "setbrickpos", "setregion", "setproximity", "getposition",
           "miningnode", "treasurechest", "healthfountain", "xpnode", "nodes",
           "debugbrick", "testevents"
         ] 
       };
  }

  async stop() {}
}
