/**
 * World Save Service
 * 
 * Handles persistent world save data and state management
 * for the RPG system.
 */

import { OL, PS } from "omegga";
import { BrickTrigger } from './NodeService';

/**
 * Service class for managing world save data
 */
export class WorldSaveService {
  private omegga: OL;
  private store: PS<any>;

  constructor(omegga: OL, store: PS<any>) {
    this.omegga = omegga;
    this.store = store;
  }

  /**
   * Saves world state data
   * 
   * @param data - The world state data to save
   */
  async saveWorldState(data: any): Promise<void> {
    try {
      await this.store.set("world_state", data);
      console.log("[Hoopla RPG] World state saved successfully");
    } catch (error) {
      console.error("[Hoopla RPG] Error saving world state:", error);
    }
  }

  /**
   * Loads world state data
   * 
   * @returns Promise resolving to the world state data
   */
  async loadWorldState(): Promise<any> {
    try {
      const data = await this.store.get("world_state");
      return data || {};
    } catch (error) {
      console.error("[Hoopla RPG] Error loading world state:", error);
      return {};
    }
  }

  /**
   * Saves trigger data to world state
   * 
   * @param triggers - The triggers to save
   */
  async saveTriggerData(triggers: { [triggerId: string]: BrickTrigger }): Promise<void> {
    try {
      await this.store.set("brick_triggers_data", triggers);
    } catch (error) {
      // Error saving trigger data
    }
  }

  /**
   * Loads trigger data from world state
   * 
   * @returns Promise resolving to the trigger data
   */
  async loadTriggerData(): Promise<{ [triggerId: string]: BrickTrigger }> {
    try {
      const data = await this.store.get("brick_triggers_data");
      return data && typeof data === 'object' ? (data as any) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Saves node cooldown data
   * 
   * @param cooldowns - The cooldown data to save
   */
  async saveNodeCooldowns(cooldowns: { [nodeId: string]: { [playerId: string]: number } }): Promise<void> {
    try {
      await this.store.set("node_cooldowns", cooldowns);
    } catch (error) {
      // Error saving node cooldowns
    }
  }

  /**
   * Loads node cooldown data
   * 
   * @returns Promise resolving to the cooldown data
   */
  async loadNodeCooldowns(): Promise<{ [nodeId: string]: { [playerId: string]: number } }> {
    try {
      const data = await this.store.get("node_cooldowns");
      return data && typeof data === 'object' ? (data as any) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Saves world configuration
   * 
   * @param config - The world configuration to save
   */
  async saveWorldConfig(config: any): Promise<void> {
    try {
      await this.store.set("world_config", config);
    } catch (error) {
      // Error saving world configuration
    }
  }

  /**
   * Loads world configuration
   * 
   * @returns Promise resolving to the world configuration
   */
  async loadWorldConfig(): Promise<any> {
    try {
      const data = await this.store.get("world_config");
      return data || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Saves world statistics
   * 
   * @param stats - The world statistics to save
   */
  async saveWorldStats(stats: any): Promise<void> {
    try {
      await this.store.set("world_stats", stats);
    } catch (error) {
      // Error saving world statistics
    }
  }

  /**
   * Loads world statistics
   * 
   * @returns Promise resolving to the world statistics
   */
  async loadWorldStats(): Promise<any> {
    try {
      const data = await this.store.get("world_stats");
      return data || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Creates a backup of all world data
   * 
   * @param backupName - The name of the backup
   */
  async createWorldBackup(backupName: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const backupKey = `world_backup_${backupName}_${timestamp}`;
      
      const worldData = {
        triggers: await this.loadTriggerData(),
        cooldowns: await this.loadNodeCooldowns(),
        config: await this.loadWorldConfig(),
        stats: await this.loadWorldStats(),
        state: await this.loadWorldState()
      };
      
      await this.store.set(backupKey, worldData);
    } catch (error) {
      // Error creating world backup
    }
  }

  /**
   * Restores world data from a backup
   * 
   * @param backupName - The name of the backup to restore
   */
  async restoreWorldBackup(backupName: string): Promise<void> {
    try {
      const backupKey = `world_backup_${backupName}`;
      const backupData = await this.store.get(backupKey);
      
      if (!backupData) {
        throw new Error(`Backup ${backupName} not found`);
      }
      
      if (backupData.triggers) {
        await this.saveTriggerData(backupData.triggers);
      }
      
      if (backupData.cooldowns) {
        await this.saveNodeCooldowns(backupData.cooldowns);
      }
      
      if (backupData.config) {
        await this.saveWorldConfig(backupData.config);
      }
      
      if (backupData.stats) {
        await this.saveWorldStats(backupData.stats);
      }
      
      if (backupData.state) {
        await this.saveWorldState(backupData.state);
      }
      
    } catch (error) {
      // Error restoring world backup
    }
  }

  /**
   * Clears all world data
   */
  async clearWorldData(): Promise<void> {
    try {
      await this.store.set("brick_triggers_data", {});
      await this.store.set("node_cooldowns", {});
      await this.store.set("world_config", {});
      await this.store.set("world_stats", {});
      await this.store.set("world_state", {});
      
    } catch (error) {
      // Error clearing world data
    }
  }

  /**
   * Gets world data size information
   * 
   * @returns Object containing size information
   */
  async getWorldDataSize(): Promise<{
    triggers: number;
    cooldowns: number;
    config: number;
    stats: number;
    state: number;
    total: number;
  }> {
    try {
      const triggers = await this.loadTriggerData();
      const cooldowns = await this.loadNodeCooldowns();
      const config = await this.loadWorldConfig();
      const stats = await this.loadWorldStats();
      const state = await this.loadWorldState();
      
      const getSize = (obj: any) => JSON.stringify(obj).length;
      
      const sizes = {
        triggers: getSize(triggers),
        cooldowns: getSize(cooldowns),
        config: getSize(config),
        stats: getSize(stats),
        state: getSize(state),
        total: 0
      };
      
      sizes.total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
      
      return sizes;
    } catch (error) {
      return {
        triggers: 0,
        cooldowns: 0,
        config: 0,
        stats: 0,
        state: 0,
        total: 0
      };
    }
  }

  /**
   * Validates world data integrity
   * 
   * @returns Object containing validation results
   */
  async validateWorldData(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Validate triggers
      const triggers = await this.loadTriggerData();
      if (typeof triggers !== 'object') {
        errors.push('Trigger data is not a valid object');
      } else {
        for (const [triggerId, trigger] of Object.entries(triggers)) {
          if (!trigger.id) {
            errors.push(`Trigger ${triggerId} is missing ID`);
          }
          if (!trigger.type) {
            errors.push(`Trigger ${triggerId} is missing type`);
          }
        }
      }
      
      // Validate cooldowns
      const cooldowns = await this.loadNodeCooldowns();
      if (typeof cooldowns !== 'object') {
        errors.push('Cooldown data is not a valid object');
      }
      
      // Validate config
      const config = await this.loadWorldConfig();
      if (typeof config !== 'object') {
        warnings.push('World config is not a valid object');
      }
      
      // Validate stats
      const stats = await this.loadWorldStats();
      if (typeof stats !== 'object') {
        warnings.push('World stats is not a valid object');
      }
      
      // Validate state
      const state = await this.loadWorldState();
      if (typeof state !== 'object') {
        warnings.push('World state is not a valid object');
      }
      
    } catch (error) {
      errors.push(`Validation error: ${error}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
