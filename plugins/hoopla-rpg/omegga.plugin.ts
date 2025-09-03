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
};

type BrickTrigger = {
  id: string;
  type: 'xp' | 'currency' | 'item' | 'heal' | 'sell';
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

  // Get sell price for different resources
  getResourceSellPrice(resourceType: string): number {
    switch (resourceType.toLowerCase()) {
      case 'copper': return 1;
      case 'iron': return 3;
      case 'gold': return 10;
      default: return 1; // Default price for unknown resources
    }
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

    // Check cooldown
    const now = Date.now();
    const lastUsed = trigger.lastUsed[playerId] || 0;
    if (now - lastUsed < trigger.cooldown) {
      const remaining = Math.ceil((trigger.cooldown - (now - lastUsed)) / 1000);
                return { success: false, message: `Cooldown active! Try again in ${remaining} seconds.` };
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
           const itemCount = updatedPlayer.inventory.filter(item => item === trigger.message).length;
           
                       // Enhanced message with cooldown information
            const cooldownSeconds = Math.ceil(trigger.cooldown / 1000);
          return { 
            success: true, 
              message: `Found ${trigger.message}! You now have ${itemCount} total. This node is now depleted and will regenerate in ${cooldownSeconds} seconds.`,
            reward: { type: 'item', item: trigger.message }
          };

        case 'heal':
          const healResult = await this.healPlayer({ id: playerId }, trigger.value);
          return { 
            success: true, 
            message: trigger.message.replace('{value}', trigger.value.toString()),
            reward: { type: 'heal', amount: trigger.value, healed: healResult.healed }
          };

        case 'sell':
          // Check if player has the resource to sell
          const player = await this.getPlayerData({ id: playerId });
          if (!player.inventory || !player.inventory.includes(trigger.message)) {
            return { 
              success: false, 
              message: `You don't have any ${trigger.message} to sell!` 
            };
          }

          // Remove one item from inventory
          await this.removeFromInventory({ id: playerId }, trigger.message);
          
          // Add currency
          await this.currency.add(playerId, "currency", trigger.value);
          
          // Get updated player data for display
          const updatedPlayerData = await this.getPlayerData({ id: playerId });
          const remainingCount = updatedPlayerData.inventory.filter(item => item === trigger.message).length;
          const newCurrency = await this.currency.getCurrency(playerId);
          const formattedCurrency = await this.currency.format(newCurrency);
          
          return { 
            success: true, 
            message: `Sold ${trigger.message} for ${await this.currency.format(trigger.value)}! You now have ${formattedCurrency} and ${remainingCount} ${trigger.message} remaining.`,
            reward: { type: 'sell', item: trigger.message, price: trigger.value, remainingCount, newCurrency: formattedCurrency }
          };

        default:
          return { success: false, message: "Unknown trigger type!" };
       }
     } catch (error) {
       console.error(`Error processing brick trigger ${triggerId}:`, error);
              return { success: false, message: "Error processing trigger!" };
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
               } else {
                 console.log(`[Hoopla RPG] [${player.name}] is mining node: ${triggerId.replace('mining_', '').split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
               }
               matchFound = true;
              
              const result = await this.triggerBrickAction(player.id, triggerId);
              
                             if (result.success) {
                 this.omegga.whisper(player.name, `<color="0f0">${result.message}</color>`);
                 if (trigger.type === 'sell') {
                   console.log(`[Hoopla RPG] [${player.name}] successfully sold resource: ${result.reward?.item || 'unknown'}`);
                 } else {
                   console.log(`[Hoopla RPG] [${player.name}] successfully collected resource: ${result.reward?.item || 'unknown'}`);
                 }
               } else {
                 this.omegga.whisper(player.name, `<color="f00">${result.message}</color>`);
               }
              break;
            }
          }
        }
      }
      
      if (!matchFound) {
        // Optional: whisper to player that this brick has no triggers
        this.omegga.whisper(player.name, `<color="f0f">This brick has no RPG triggers set up.</color>`);
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
        nodesCollected: rpgData.nodesCollected ?? []
      };
      
      // Count items by type for better display
      const itemCounts: { [key: string]: number } = {};
      for (const item of safeRpgData.inventory) {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
      }
      
      // Format inventory display
      let inventoryDisplay = "Empty";
      if (Object.keys(itemCounts).length > 0) {
        inventoryDisplay = Object.entries(itemCounts)
          .map(([item, count]) => `${count} ${item}`)
          .join(", ");
      }
      
             // Calculate XP progress to next level
       const xpForCurrentLevel = (safeRpgData.level - this.config.startingLevel) * 100;
       const xpForNextLevel = this.getXPForNextLevel(safeRpgData.level);
       const xpInCurrentLevel = safeRpgData.experience - xpForCurrentLevel;
       const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
       const xpProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / (xpForNextLevel - xpForCurrentLevel)) * 100));
       
        this.omegga.whisper(speaker, 
         `<color="ff0">Level ${safeRpgData.level}</> | <color="0ff">${xpInCurrentLevel}/${xpNeededForNextLevel} XP (${Math.round(xpProgress)}%)</> | <color="f00">${safeRpgData.health}/${safeRpgData.maxHealth} HP</> | <color="0f0">${formattedCurrency}</> | <color="f0f">${inventoryDisplay}</>`
        );
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

              this.omegga.whisper(speaker, `<color="f0f">=== Setup Instructions ===</color>`);
        this.omegga.whisper(speaker, `<color="f0f">1. Set up bricks with Component_Interact and ConsoleTag like 'rpg_mining_iron' or 'rpg_mining_gold'`);
        this.omegga.whisper(speaker, `<color="f0f">2. Set up shopkeeper bricks with ConsoleTag like 'rpg_sell_copper' or 'rpg_sell_iron'`);
        this.omegga.whisper(speaker, `<color="f0f">3. Run /rpginit to automatically detect and convert all RPG bricks`);
        this.omegga.whisper(speaker, `<color="f0f">4. Click on the converted bricks to interact with them!`);
        this.omegga.whisper(speaker, `<color="0ff">Note: Mining nodes use simple cooldowns - no visual changes needed!</color>`);
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
                 } else {
                   console.log(`[Hoopla RPG] [${player.name}] is mining node: ${triggerId.replace('mining_', '').split('_')[0]}_${triggerId.split('_').slice(-2).join('_')}`);
                 }
                 matchFound = true;
                 
                 const result = await this.triggerBrickAction(player.id, triggerId);
                 
                 if (result.success) {
                   this.omegga.whisper(player.name, `<color="0f0">${result.message}</color>`);
                   if (trigger.type === 'sell') {
                     console.log(`[Hoopla RPG] [${player.name}] successfully sold resource: ${result.reward?.item || 'unknown'}`);
                   } else {
                     console.log(`[Hoopla RPG] [${player.name}] successfully collected resource: ${result.reward?.item || 'unknown'}`);
                   }
                 } else {
                   this.omegga.whisper(player.name, `<color="f00">${result.message}</color>`);
                 }
                 break;
               }
            }
          }
        }
        
        if (!matchFound) {
          // Optional: whisper to player that this brick has no triggers
          this.omegga.whisper(player.name, `<color="f0f">This brick has no RPG triggers set up.</color>`);
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
            "rpg", "rpginit", "rpghelp", "rpgclearall"
          ] 
        };
  }

  async stop() {}
}

