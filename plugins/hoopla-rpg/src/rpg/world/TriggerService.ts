/**
 * Trigger Service
 * 
 * Handles brick triggers and their interactions
 * for the world system.
 */

import { OL, PS } from "omegga";
import { BrickTrigger } from './NodeService';

/**
 * Service class for managing brick triggers
 */
export class TriggerService {
  private omegga: OL;
  private store: PS<any>;

  constructor(omegga: OL, store: PS<any>) {
    this.omegga = omegga;
    this.store = store;
  }

  /**
   * Creates a trigger from detected entity data
   * 
   * @param entityData - The detected entity data
   * @param triggerType - The type of trigger to create
   * @returns The created trigger object
   */
  createTriggerFromEntity(
    entityData: { brick: any; oreType?: string; fishType?: string; resourceType?: string; npcType?: string; consoleTag: string },
    triggerType: 'mining' | 'fishing' | 'shopkeeper' | 'npc'
  ): BrickTrigger | null {
    try {
      const { brick, consoleTag } = entityData;
      const position = brick.position;
      const nodeKey = `${position[0]},${position[1]},${position[2]}`;
      const triggerId = `rpg_${triggerType}_${nodeKey}`;
      
      switch (triggerType) {
        case 'mining':
          const oreType = entityData.oreType;
          if (!oreType) return null;
          
          return {
            id: triggerId,
            type: 'item',
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: `Mining ${oreType}...`,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            miningProgress: {},
            nodeCooldown: {}
          };
          
        case 'fishing':
          const fishType = entityData.fishType;
          if (!fishType) return null;
          
          let fishingMessage = `Fishing...`;
          if (fishType === 'spot') {
            fishingMessage = `Fishing in freshwater...`;
          } else if (fishType === 'spot_2') {
            fishingMessage = `Fishing in deep ocean...`;
          } else if (fishType === 'spot_3') {
            fishingMessage = `Fishing in tropical waters...`;
          } else if (fishType === 'spot_4') {
            fishingMessage = `Fishing in arctic waters...`;
          }
          
          return {
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
          
        case 'shopkeeper':
          const resourceType = entityData.resourceType;
          if (!resourceType) return null;
          
          // Determine if this is a buy or sell trigger
          let shopTriggerType: 'buy' | 'sell' = 'sell';
          let itemPrice = 0;
          
          if (consoleTag.startsWith('rpg_buy_')) {
            shopTriggerType = 'buy';
            if (consoleTag.includes('bait')) {
              itemPrice = 100; // Fish bait costs 100 currency for 20 pieces
            }
          } else if (consoleTag.startsWith('rpg_sell_')) {
            shopTriggerType = 'sell';
            // This would need to be injected from ResourceService
            itemPrice = 0; // Placeholder
          }
          
          return {
            id: triggerId,
            type: shopTriggerType,
            value: itemPrice,
            cooldown: 0,
            lastUsed: {},
            message: resourceType,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }]
          };
          
        case 'npc':
          const npcType = entityData.npcType;
          if (!npcType) return null;
          
          // Determine if this is a quest or questitem trigger
          let npcTriggerType: 'quest' | 'questitem' = 'quest';
          
          if (consoleTag.startsWith('rpg_questitem_')) {
            npcTriggerType = 'questitem';
          }
          
          return {
            id: triggerId,
            type: npcTriggerType,
            value: 0,
            cooldown: 0,
            lastUsed: {},
            message: npcType,
            triggerType: 'click',
            brickPositions: [{ x: position[0], y: position[1], z: position[2] }],
            collectedBy: npcTriggerType === 'questitem' ? [] : undefined
          };
          
        default:
          return null;
      }
    } catch (error) {
      console.error(`[Hoopla RPG] Error creating trigger from entity:`, error);
      return null;
    }
  }

  /**
   * Validates a trigger configuration
   * 
   * @param trigger - The trigger to validate
   * @returns Object containing validation results
   */
  validateTrigger(trigger: BrickTrigger): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check required fields
    if (!trigger.id || trigger.id.trim() === '') {
      errors.push('Trigger ID is required');
    }
    
    if (!trigger.type) {
      errors.push('Trigger type is required');
    }
    
    if (!trigger.message || trigger.message.trim() === '') {
      errors.push('Trigger message is required');
    }
    
    if (!trigger.triggerType) {
      errors.push('Trigger triggerType is required');
    }
    
    // Check brick positions
    if (!trigger.brickPositions || trigger.brickPositions.length === 0) {
      errors.push('Trigger must have at least one brick position');
    } else {
      for (const pos of trigger.brickPositions) {
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
          errors.push('Brick positions must have valid x, y, z coordinates');
          break;
        }
      }
    }
    
    // Check type-specific requirements
    switch (trigger.type) {
      case 'item':
        if (!trigger.miningProgress) {
          warnings.push('Mining triggers should have miningProgress tracking');
        }
        if (!trigger.nodeCooldown) {
          warnings.push('Mining triggers should have nodeCooldown tracking');
        }
        break;
        
      case 'fish':
        if (!trigger.fishingProgress) {
          warnings.push('Fishing triggers should have fishingProgress tracking');
        }
        if (!trigger.fishingAttemptsRemaining) {
          warnings.push('Fishing triggers should have fishingAttemptsRemaining tracking');
        }
        if (!trigger.nodeCooldown) {
          warnings.push('Fishing triggers should have nodeCooldown tracking');
        }
        break;
        
      case 'questitem':
        if (!trigger.collectedBy) {
          warnings.push('Quest item triggers should have collectedBy tracking');
        }
        break;
    }
    
    // Check cooldown values
    if (trigger.cooldown < 0) {
      errors.push('Cooldown cannot be negative');
    }
    
    if (trigger.value < 0) {
      errors.push('Value cannot be negative');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Converts detected entities to triggers
   * 
   * @param entities - The detected entities
   * @returns Array of created triggers
   */
  convertEntitiesToTriggers(entities: {
    nodes: {
      mining: Array<{ brick: any; oreType: string; consoleTag: string }>;
      fishing: Array<{ brick: any; fishType: string; consoleTag: string }>;
      shopkeepers: Array<{ brick: any; resourceType: string; consoleTag: string }>;
    };
    npcs: Array<{ brick: any; npcType: string; consoleTag: string }>;
  }): BrickTrigger[] {
    const triggers: BrickTrigger[] = [];
    
    // Convert mining nodes
    for (const entity of entities.nodes.mining) {
      const trigger = this.createTriggerFromEntity(entity, 'mining');
      if (trigger) {
        triggers.push(trigger);
      }
    }
    
    // Convert fishing nodes
    for (const entity of entities.nodes.fishing) {
      const trigger = this.createTriggerFromEntity(entity, 'fishing');
      if (trigger) {
        triggers.push(trigger);
      }
    }
    
    // Convert shopkeeper nodes
    for (const entity of entities.nodes.shopkeepers) {
      const trigger = this.createTriggerFromEntity(entity, 'shopkeeper');
      if (trigger) {
        triggers.push(trigger);
      }
    }
    
    // Convert NPCs
    for (const entity of entities.npcs) {
      const trigger = this.createTriggerFromEntity(entity, 'npc');
      if (trigger) {
        triggers.push(trigger);
      }
    }
    
    return triggers;
  }

  /**
   * Gets trigger statistics
   * 
   * @param triggers - Array of triggers to analyze
   * @returns Object containing trigger statistics
   */
  getTriggerStatistics(triggers: BrickTrigger[]): {
    total: number;
    byType: { [type: string]: number };
    byTriggerType: { [triggerType: string]: number };
    validationResults: {
      valid: number;
      invalid: number;
      warnings: number;
    };
  } {
    const byType: { [type: string]: number } = {};
    const byTriggerType: { [triggerType: string]: number } = {};
    let validCount = 0;
    let invalidCount = 0;
    let warningCount = 0;
    
    for (const trigger of triggers) {
      // Count by type
      byType[trigger.type] = (byType[trigger.type] || 0) + 1;
      
      // Count by trigger type
      byTriggerType[trigger.triggerType] = (byTriggerType[trigger.triggerType] || 0) + 1;
      
      // Validate trigger
      const validation = this.validateTrigger(trigger);
      if (validation.valid) {
        validCount++;
      } else {
        invalidCount++;
      }
      
      if (validation.warnings.length > 0) {
        warningCount++;
      }
    }
    
    return {
      total: triggers.length,
      byType,
      byTriggerType,
      validationResults: {
        valid: validCount,
        invalid: invalidCount,
        warnings: warningCount
      }
    };
  }

  /**
   * Filters triggers by type
   * 
   * @param triggers - Array of triggers to filter
   * @param type - The type to filter by
   * @returns Array of filtered triggers
   */
  filterTriggersByType(triggers: BrickTrigger[], type: string): BrickTrigger[] {
    return triggers.filter(trigger => trigger.type === type);
  }

  /**
   * Filters triggers by trigger type
   * 
   * @param triggers - Array of triggers to filter
   * @param triggerType - The trigger type to filter by
   * @returns Array of filtered triggers
   */
  filterTriggersByTriggerType(triggers: BrickTrigger[], triggerType: string): BrickTrigger[] {
    return triggers.filter(trigger => trigger.triggerType === triggerType);
  }

  /**
   * Gets triggers at a specific position
   * 
   * @param triggers - Array of triggers to search
   * @param position - The position to search for
   * @returns Array of triggers at the position
   */
  getTriggersAtPosition(triggers: BrickTrigger[], position: { x: number; y: number; z: number }): BrickTrigger[] {
    return triggers.filter(trigger => 
      trigger.brickPositions && trigger.brickPositions.some(pos => 
        pos.x === position.x && pos.y === position.y && pos.z === position.z
      )
    );
  }
}
