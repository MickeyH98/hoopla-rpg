/**
 * Node Service
 * 
 * Handles RPG nodes (mining/fishing), cooldowns, and interactions
 * for the world system.
 */

import { OL, PS } from "omegga";
import { PlayerId, RPGPlayer } from '../player/PlayerService';
import { InventoryService } from '../player/InventoryService';
import { UnifiedXPService } from '../progression/UnifiedXPService';
import { ResourceService } from '../economy/ResourceService';
import { BarteringService } from '../economy/BarteringService';
import { ProgressBarService } from '../utils/ProgressBar';

// Type definitions
export type BrickTrigger = {
  id: string;
  type: 'xp' | 'currency' | 'item' | 'heal' | 'fish' | 'bulk_sell' | 'buy' | 'quest' | 'questitem' | 'lava';
  value: number;
  cooldown: number;
  lastUsed: { [playerId: string]: number };
  message: string;
  color?: string;
  brickPositions?: Array<{ x: number; y: number; z: number }>;
  regionBounds?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  triggerType: 'click' | 'region' | 'proximity';
  proximityRadius?: number;
  miningProgress?: { [playerId: string]: number };
  fishingProgress?: { [playerId: string]: number };
  fishingAttemptsRemaining?: { [playerId: string]: number };
  fishingTarget?: { [playerId: string]: string };
  nodeCooldown?: { [playerId: string]: number };
  collectedBy?: string[];
};

/**
 * Service class for managing RPG nodes and interactions
 */
export class NodeService {
  private omegga: OL;
  private store: PS<any>;
  private inventoryService: InventoryService;
  private unifiedXPService: UnifiedXPService;
  private resourceService: ResourceService;
  private barteringService: BarteringService;
  private progressBarService: ProgressBarService;

  constructor(
    omegga: OL,
    store: PS<any>,
    inventoryService: InventoryService,
    unifiedXPService: UnifiedXPService,
    resourceService: ResourceService,
    barteringService: BarteringService,
    progressBarService: ProgressBarService
  ) {
    this.omegga = omegga;
    this.store = store;
    this.inventoryService = inventoryService;
    this.unifiedXPService = unifiedXPService;
    this.resourceService = resourceService;
    this.barteringService = barteringService;
    this.progressBarService = progressBarService;
  }

  /**
   * Gets all brick triggers from storage
   * 
   * @returns Promise resolving to all brick triggers
   */
  async getBrickTriggers(): Promise<{ [triggerId: string]: BrickTrigger }> {
    const data = await this.store.get("brick_triggers_data");
    return data && typeof data === 'object' ? (data as any) : {};
  }

  /**
   * Saves all brick triggers to storage
   * 
   * @param triggers - The triggers to save
   */
  async setBrickTriggers(triggers: { [triggerId: string]: BrickTrigger }): Promise<void> {
    await this.store.set("brick_triggers_data", triggers as any);
  }

  /**
   * Creates a new brick trigger
   * 
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   */
  async createBrickTrigger(triggerId: string, trigger: BrickTrigger): Promise<void> {
    const triggers = await this.getBrickTriggers();
    triggers[triggerId] = trigger;
    await this.setBrickTriggers(triggers);
  }

  /**
   * Removes a brick trigger
   * 
   * @param triggerId - The ID of the trigger to remove
   * @returns True if the trigger was removed, false if not found
   */
  async removeBrickTrigger(triggerId: string): Promise<boolean> {
    const triggers = await this.getBrickTriggers();
    if (triggers[triggerId]) {
      delete triggers[triggerId];
      await this.setBrickTriggers(triggers);
      return true;
    }
    return false;
  }

  /**
   * Sets the status of a mining node (active/inactive)
   * 
   * @param triggerId - The ID of the trigger
   * @param active - Whether the node should be active
   */
  async setMiningNodeStatus(triggerId: string, active: boolean): Promise<void> {
    try {
      const triggers = await this.getBrickTriggers();
      const trigger = triggers[triggerId];
      
      if (!trigger || !trigger.brickPositions) {
        return;
      }

      // Update the trigger's active status
      trigger.active = active;
      
      // If deactivating, clear all player cooldowns
      if (!active) {
        trigger.nodeCooldown = {};
      }
      
      await this.setBrickTriggers(triggers);
      
      console.log(`[Hoopla RPG] Mining node ${triggerId} ${active ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error(`[Hoopla RPG] Error setting mining node status:`, error);
    }
  }

  /**
   * Gets the cooldown status of a mining node for a player
   * 
   * @param triggerId - The ID of the trigger
   * @param playerId - The ID of the player
   * @returns Object containing active status and remaining time
   */
  async getMiningNodeCooldownStatus(triggerId: string, playerId: string): Promise<{ active: boolean; remainingTime: number }> {
    try {
      const triggers = await this.getBrickTriggers();
      const trigger = triggers[triggerId];
      
      if (!trigger || trigger.type !== 'item') {
        return { active: true, remainingTime: 0 };
      }

      const now = Date.now();
      const cooldownTime = trigger.nodeCooldown?.[playerId] || 0;
      const remainingTime = Math.max(0, cooldownTime - now);

      return {
        active: remainingTime <= 0,
        remainingTime: Math.ceil(remainingTime / 1000)
      };
    } catch (error) {
      console.error(`[Hoopla RPG] Error getting mining node cooldown status:`, error);
      return { active: true, remainingTime: 0 };
    }
  }

  /**
   * Restores all mining node statuses (removes expired cooldowns)
   */
  async restoreAllMiningNodeStatus(): Promise<void> {
    try {
      const triggers = await this.getBrickTriggers();
      let restoredCount = 0;
      
      for (const [triggerId, trigger] of Object.entries(triggers)) {
        if (trigger.type === 'item' && trigger.brickPositions) {
          // Check if cooldown has expired
          const now = Date.now();
          const cooldownTime = trigger.nodeCooldown?.[triggerId] || 0;
          
          if (cooldownTime > 0 && now >= cooldownTime) {
            // Cooldown expired, restore node
            await this.setMiningNodeStatus(triggerId, true);
            restoredCount++;
          }
        }
      }
      
    } catch (error) {
      // Error restoring mining node status
    }
  }

  /**
   * Initializes a single RPG node based on interaction
   * 
   * @param player - The player object
   * @param nodeData - The node data to initialize
   * @returns True if a new trigger was created
   */
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
      
      const triggerId = `rpg_${type}_${subtype}_${nodeKey}`;
      let trigger: BrickTrigger;
      
      switch (type) {
        case 'mining':
          trigger = {
            id: triggerId,
            type: 'item',
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: `Mining ${subtype}...`,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            miningProgress: {},
            nodeCooldown: {}
          };
          break;
          
        case 'fishing':
          let fishingMessage = `Fishing...`;
          if (subtype === 'spot') {
            fishingMessage = `Fishing in freshwater...`;
          } else if (subtype === 'spot_2') {
            fishingMessage = `Fishing in deep ocean...`;
          } else if (subtype === 'spot_3') {
            fishingMessage = `Fishing in tropical waters...`;
          } else if (subtype === 'spot_4') {
            fishingMessage = `Fishing in arctic waters...`;
          }
          
          trigger = {
            id: triggerId,
            type: 'fish',
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: fishingMessage,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            fishingProgress: {},
            fishingAttemptsRemaining: {},
            nodeCooldown: {}
          };
          break;
          
        case 'buy':
          let itemPrice = 0;
          if (type === 'buy') {
            if (consoleTag.includes('bait')) {
              itemPrice = 100; // Fish bait costs 100 currency for 20 pieces
            }
          } else {
            itemPrice = this.resourceService.getResourceSellPrice(subtype);
          }
          
          trigger = {
            id: triggerId,
            type: type as any,
            value: itemPrice,
            cooldown: 0,
            lastUsed: {},
            message: subtype,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }]
          };
          break;
          
        case 'quest':
          trigger = {
            id: triggerId,
            type: 'quest',
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: subtype,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }]
          };
          break;
          
        case 'questitem':
          trigger = {
            id: triggerId,
            type: 'questitem',
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: subtype,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            collectedBy: []
          };
          break;
          
        case 'lava':
          if (subtype === 'lava') {
            trigger = {
              id: triggerId,
              type: 'lava',
              value: 0,
              cooldown: 0,
              lastUsed: {},
              message: 'Lava damage',
              triggerType: 'click',
              brickPositions: [{ x: position[0], y: position[1], z: position[2] }]
            };
          }
          break;
          
        default:
          return false;
      }
      
      // Create the trigger
      await this.createBrickTrigger(triggerId, trigger);
      return true; // New trigger created
      
    } catch (error) {
      console.error(`[Hoopla RPG] Error initializing RPG node:`, error);
      return false; // No trigger created due to error
    }
  }

  /**
   * Triggers a brick action for a player
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @returns Object containing success status, message, and reward
   */
  async triggerBrickAction(playerId: string, triggerId: string): Promise<{ success: boolean; message: string; reward?: any }> {
    const triggers = await this.getBrickTriggers();
    const trigger = triggers[triggerId];
    
    if (!trigger) {
      return { success: false, message: "Trigger not found!" };
    }

    // Handle different trigger types
    switch (trigger.type) {
      case 'xp':
        // Check cooldown for non-mining triggers
        const xpNow = Date.now();
        const xpLastUsed = trigger.lastUsed[playerId] || 0;
        if (xpNow - xpLastUsed < trigger.cooldown) {
          const remainingTime = Math.ceil((trigger.cooldown - (xpNow - xpLastUsed)) / 1000);
          return { success: false, message: `Cooldown: ${remainingTime}s remaining` };
        }
        
        // Update last used time for non-mining triggers
        trigger.lastUsed[playerId] = xpNow;
        await this.setBrickTriggers(triggers);
        
        const xpResult = await this.unifiedXPService.grantXP(playerId, {
          playerXP: trigger.value,
          grantClassXP: true
        });
        return { 
          success: true, 
          message: trigger.message.replace('{value}', trigger.value.toString()),
          reward: { type: 'xp', amount: trigger.value, leveledUp: xpResult.playerLeveledUp, newLevel: xpResult.newPlayerLevel }
        };

      case 'currency':
        // Check cooldown for non-mining triggers
        const currencyNow = Date.now();
        const currencyLastUsed = trigger.lastUsed[playerId] || 0;
        if (currencyNow - currencyLastUsed < trigger.cooldown) {
          const remainingTime = Math.ceil((trigger.cooldown - (currencyNow - currencyLastUsed)) / 1000);
          return { success: false, message: `Cooldown: ${remainingTime}s remaining` };
        }
        
        // Update last used time for non-mining triggers
        trigger.lastUsed[playerId] = currencyNow;
        await this.setBrickTriggers(triggers);
        
        // This would need to be injected from the main plugin
        return { 
          success: true, 
          message: trigger.message.replace('{value}', trigger.value.toString()),
          reward: { type: 'currency', amount: trigger.value }
        };

      case 'item':
        // Handle mining nodes
        return await this.handleMiningNode(playerId, triggerId, trigger);

      case 'fish':
        // Handle fishing nodes
        return await this.handleFishingNode(playerId, triggerId, trigger);

      case 'buy':
        // Handle buying items
        return await this.handleBuyNode(playerId, triggerId, trigger);

      case 'quest':
        // Handle quest interactions
        return await this.handleQuestNode(playerId, triggerId, trigger);

      case 'questitem':
        // Handle quest item collection
        return await this.handleQuestItemNode(playerId, triggerId, trigger);

      case 'lava':
        // Handle lava damage
        return await this.handleLavaNode(playerId, triggerId, trigger);

      default:
        return { success: false, message: "Unknown trigger type!" };
    }
  }

  /**
   * Handles mining node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @returns Object containing success status, message, and reward
   */
  private async handleMiningNode(playerId: string, triggerId: string, trigger: BrickTrigger): Promise<{ success: boolean; message: string; reward?: any }> {
    // This is a placeholder - the actual implementation would be in MiningService
    return { success: false, message: "Mining not implemented in NodeService" };
  }

  /**
   * Handles fishing node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @returns Object containing success status, message, and reward
   */
  private async handleFishingNode(playerId: string, triggerId: string, trigger: BrickTrigger): Promise<{ success: boolean; message: string; reward?: any }> {
    // This is a placeholder - the actual implementation would be in FishingService
    return { success: false, message: "Fishing not implemented in NodeService" };
  }


  /**
   * Handles buy node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @returns Object containing success status, message, and reward
   */
  private async handleBuyNode(playerId: string, triggerId: string, trigger: BrickTrigger): Promise<{ success: boolean; message: string; reward?: any }> {
    // This is a placeholder - the actual implementation would be in EconomyService
    return { success: false, message: "Buying not implemented in NodeService" };
  }

  /**
   * Handles quest node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @returns Object containing success status, message, and reward
   */
  private async handleQuestNode(playerId: string, triggerId: string, trigger: BrickTrigger): Promise<{ success: boolean; message: string; reward?: any }> {
    // This is a placeholder - the actual implementation would be in QuestService
    return { success: false, message: "Quest interactions not implemented in NodeService" };
  }

  /**
   * Handles quest item node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @returns Object containing success status, message, and reward
   */
  private async handleQuestItemNode(playerId: string, triggerId: string, trigger: BrickTrigger): Promise<{ success: boolean; message: string; reward?: any }> {
    // This is a placeholder - the actual implementation would be in QuestService
    return { success: false, message: "Quest item collection not implemented in NodeService" };
  }

  /**
   * Handles lava node interactions
   * 
   * @param playerId - The ID of the player
   * @param triggerId - The ID of the trigger
   * @param trigger - The trigger data
   * @returns Object containing success status, message, and reward
   */
  private async handleLavaNode(playerId: string, triggerId: string, trigger: BrickTrigger): Promise<{ success: boolean; message: string; reward?: any }> {
    // This is a placeholder - the actual implementation would be in PlayerService
    return { success: false, message: "Lava damage not implemented in NodeService" };
  }
}
