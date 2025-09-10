/**
 * Detection Service
 * 
 * Handles auto-detection of NPCs and nodes in the world
 * for the RPG system.
 */

import { OL } from "omegga";

/**
 * Service class for detecting and managing world entities
 */
export class DetectionService {
  private omegga: OL;

  constructor(omegga: OL) {
    this.omegga = omegga;
  }

  /**
   * Detects RPG nodes in the world by scanning for bricks with specific console tags
   * 
   * @returns Promise resolving to detected node data
   */
  async detectRPGNodes(): Promise<{
    mining: Array<{ brick: any; oreType: string; consoleTag: string }>;
    fishing: Array<{ brick: any; fishType: string; consoleTag: string }>;
    shopkeepers: Array<{ brick: any; resourceType: string; consoleTag: string }>;
  }> {
    try {
      console.log("[Hoopla RPG] Starting RPG node detection...");
      
      // Get all bricks in the world
      const bricks = await this.omegga.getBricks();
      
      const miningBricks: Array<{ brick: any; oreType: string; consoleTag: string }> = [];
      const fishingBricks: Array<{ brick: any; fishType: string; consoleTag: string }> = [];
      const shopkeeperBricks: Array<{ brick: any; resourceType: string; consoleTag: string }> = [];
      
      // Scan each brick for RPG console tags
      for (const brick of bricks) {
        if (brick.components && brick.components.Component_Interact) {
          const consoleTag = brick.components.Component_Interact.consoleTag;
          
          if (consoleTag) {
            // Check for mining nodes
            if (consoleTag.startsWith("rpg_mining_")) {
              let oreType = consoleTag.replace("rpg_mining_", "");
              miningBricks.push({ brick, oreType, consoleTag });
            }
            
            // Check for fishing nodes
            else if (consoleTag.startsWith("rpg_fishing_")) {
              let fishType = consoleTag.replace("rpg_fishing_", "");
              fishingBricks.push({ brick, fishType, consoleTag });
            }
            
            // Check for shopkeeper nodes
            else if (consoleTag.startsWith("rpg_sell_") || consoleTag.startsWith("rpg_buy_") || 
                     consoleTag.startsWith("rpg_bulk_sell_") || consoleTag.startsWith("rpg_bulk_buy_")) {
              let resourceType = consoleTag.replace(/^rpg_(sell_|buy_|bulk_sell_|bulk_buy_)/, "");
              shopkeeperBricks.push({ brick, resourceType, consoleTag });
            }
          }
        }
      }
      
      return {
        mining: miningBricks,
        fishing: fishingBricks,
        shopkeepers: shopkeeperBricks
      };
      
    } catch (error) {
      return {
        mining: [],
        fishing: [],
        shopkeepers: []
      };
    }
  }

  /**
   * Detects NPCs in the world by scanning for bricks with quest-related console tags
   * 
   * @returns Promise resolving to detected NPC data
   */
  async detectNPCs(): Promise<Array<{ brick: any; npcType: string; consoleTag: string }>> {
    try {
      console.log("[Hoopla RPG] Starting NPC detection...");
      
      // Get all bricks in the world
      const bricks = await this.omegga.getBricks();
      
      const npcs: Array<{ brick: any; npcType: string; consoleTag: string }> = [];
      
      // Scan each brick for NPC console tags
      for (const brick of bricks) {
        if (brick.components && brick.components.Component_Interact) {
          const consoleTag = brick.components.Component_Interact.consoleTag;
          
          if (consoleTag) {
            // Check for quest NPCs
            if (consoleTag.startsWith("rpg_quest_")) {
              let npcType = consoleTag.replace("rpg_quest_", "");
              npcs.push({ brick, npcType, consoleTag });
            }
            
            // Check for quest item nodes
            else if (consoleTag.startsWith("rpg_questitem_")) {
              let npcType = consoleTag.replace("rpg_questitem_", "");
              npcs.push({ brick, npcType, consoleTag });
            }
          }
        }
      }
      
      return npcs;
      
    } catch (error) {
      return [];
    }
  }

  /**
   * Detects all RPG-related entities in the world
   * 
   * @returns Promise resolving to all detected entities
   */
  async detectAllEntities(): Promise<{
    nodes: {
      mining: Array<{ brick: any; oreType: string; consoleTag: string }>;
      fishing: Array<{ brick: any; fishType: string; consoleTag: string }>;
      shopkeepers: Array<{ brick: any; resourceType: string; consoleTag: string }>;
    };
    npcs: Array<{ brick: any; npcType: string; consoleTag: string }>;
    total: number;
  }> {
    try {
      console.log("[Hoopla RPG] Starting comprehensive entity detection...");
      
      const [nodes, npcs] = await Promise.all([
        this.detectRPGNodes(),
        this.detectNPCs()
      ]);
      
      const total = nodes.mining.length + nodes.fishing.length + nodes.shopkeepers.length + npcs.length;
      
      console.log(`[Hoopla RPG] Comprehensive detection complete: ${total} total entities found`);
      
      return {
        nodes,
        npcs,
        total
      };
      
    } catch (error) {
      return {
        nodes: { mining: [], fishing: [], shopkeepers: [] },
        npcs: [],
        total: 0
      };
    }
  }

  /**
   * Validates that detected entities have proper configuration
   * 
   * @param entities - The detected entities to validate
   * @returns Object containing validation results
   */
  validateEntities(entities: {
    nodes: {
      mining: Array<{ brick: any; oreType: string; consoleTag: string }>;
      fishing: Array<{ brick: any; fishType: string; consoleTag: string }>;
      shopkeepers: Array<{ brick: any; resourceType: string; consoleTag: string }>;
    };
    npcs: Array<{ brick: any; npcType: string; consoleTag: string }>;
  }): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate mining nodes
    for (const { oreType, consoleTag } of entities.nodes.mining) {
      if (!oreType || oreType.trim() === '') {
        errors.push(`Invalid mining node: empty ore type in console tag "${consoleTag}"`);
      }
    }
    
    // Validate fishing nodes
    for (const { fishType, consoleTag } of entities.nodes.fishing) {
      if (!fishType || fishType.trim() === '') {
        errors.push(`Invalid fishing node: empty fish type in console tag "${consoleTag}"`);
      }
    }
    
    // Validate shopkeeper nodes
    for (const { resourceType, consoleTag } of entities.nodes.shopkeepers) {
      if (!resourceType || resourceType.trim() === '') {
        errors.push(`Invalid shopkeeper node: empty resource type in console tag "${consoleTag}"`);
      }
    }
    
    // Validate NPCs
    for (const { npcType, consoleTag } of entities.npcs) {
      if (!npcType || npcType.trim() === '') {
        errors.push(`Invalid NPC: empty NPC type in console tag "${consoleTag}"`);
      }
    }
    
    // Check for duplicate positions
    const allPositions = new Set<string>();
    const duplicatePositions: string[] = [];
    
    const checkPosition = (position: number[], type: string, consoleTag: string) => {
      const posKey = `${position[0]},${position[1]},${position[2]}`;
      if (allPositions.has(posKey)) {
        duplicatePositions.push(`${type} at [${posKey}] (${consoleTag})`);
      } else {
        allPositions.add(posKey);
      }
    };
    
    entities.nodes.mining.forEach(({ brick, consoleTag }) => checkPosition(brick.position, 'mining', consoleTag));
    entities.nodes.fishing.forEach(({ brick, consoleTag }) => checkPosition(brick.position, 'fishing', consoleTag));
    entities.nodes.shopkeepers.forEach(({ brick, consoleTag }) => checkPosition(brick.position, 'shopkeeper', consoleTag));
    entities.npcs.forEach(({ brick, consoleTag }) => checkPosition(brick.position, 'npc', consoleTag));
    
    if (duplicatePositions.length > 0) {
      warnings.push(`Duplicate positions detected: ${duplicatePositions.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Gets statistics about detected entities
   * 
   * @param entities - The detected entities
   * @returns Object containing entity statistics
   */
  getEntityStatistics(entities: {
    nodes: {
      mining: Array<{ brick: any; oreType: string; consoleTag: string }>;
      fishing: Array<{ brick: any; fishType: string; consoleTag: string }>;
      shopkeepers: Array<{ brick: any; resourceType: string; consoleTag: string }>;
    };
    npcs: Array<{ brick: any; npcType: string; consoleTag: string }>;
  }): {
    total: number;
    byType: { [type: string]: number };
    byResource: { [resource: string]: number };
  } {
    const byType: { [type: string]: number } = {
      mining: entities.nodes.mining.length,
      fishing: entities.nodes.fishing.length,
      shopkeepers: entities.nodes.shopkeepers.length,
      npcs: entities.npcs.length
    };
    
    const byResource: { [resource: string]: number } = {};
    
    // Count mining resources
    entities.nodes.mining.forEach(({ oreType }) => {
      byResource[oreType] = (byResource[oreType] || 0) + 1;
    });
    
    // Count fishing resources
    entities.nodes.fishing.forEach(({ fishType }) => {
      byResource[fishType] = (byResource[fishType] || 0) + 1;
    });
    
    // Count shopkeeper resources
    entities.nodes.shopkeepers.forEach(({ resourceType }) => {
      byResource[resourceType] = (byResource[resourceType] || 0) + 1;
    });
    
    // Count NPCs
    entities.npcs.forEach(({ npcType }) => {
      byResource[npcType] = (byResource[npcType] || 0) + 1;
    });
    
    return {
      total: Object.values(byType).reduce((sum, count) => sum + count, 0),
      byType,
      byResource
    };
  }
}
