/**
 * Class Selection Service
 * 
 * Handles class selection process and starting equipment distribution.
 */

import { OL, PS } from 'omegga';
import { RPGClassesService, RPGClass } from './RPGClassesService';

export class ClassSelectionService {
  private omegga: OL;
  private store: PS<any>;
  private classesService: RPGClassesService;

  constructor(omegga: OL, store: PS<any>, classesService: RPGClassesService) {
    this.omegga = omegga;
    this.store = store;
    this.classesService = classesService;
  }

  /**
   * Handle class selection command
   */
  async handleClassSelection(playerId: string, classId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if player already has a class
      const hasClass = await this.classesService.hasPlayerSelectedClass(playerId);
      if (hasClass) {
        const currentClass = await this.classesService.getPlayerClass(playerId);
        return {
          success: false,
          message: `<color="f00">You already have a class!</color>\n<color="fff">Your current class: ${currentClass?.emoji} ${currentClass?.name}</color>\n<color="ff0">Class selection is permanent.</color>`
        };
      }

      // Validate class ID
      const rpgClass = this.classesService.getClass(classId);
      if (!rpgClass) {
        return {
          success: false,
          message: '<color="f00">Invalid class!</color>\n<color="fff">Available classes: warrior, mage, pirate</color>'
        };
      }

      // Set player class
      const success = await this.classesService.setPlayerClass(playerId, classId);
      if (!success) {
        return {
          success: false,
          message: '<color="f00">Error selecting class. Please try again.</color>'
        };
      }

      // Give starting equipment
      await this.giveStartingEquipment(playerId, rpgClass);

      // Get confirmation message
      const confirmationMessage = this.classesService.getClassConfirmationMessage(rpgClass);
      
      return {
        success: true,
        message: confirmationMessage
      };
    } catch (error) {
      console.error(`[Class Selection] Error handling class selection for ${playerId}:`, error);
      return {
        success: false,
        message: '<color="f00">Error selecting class. Please try again.</color>'
      };
    }
  }

  /**
   * Give starting equipment to player
   */
  private async giveStartingEquipment(playerId: string, rpgClass: RPGClass): Promise<void> {
    try {
      // Get player's current inventory
      const playerData = await this.store.get(`player_${playerId}`) as any;
      if (!playerData) {
        console.error(`[Class Selection] Player data not found for ${playerId}`);
        return;
      }

      // Initialize inventory if it doesn't exist
      if (!playerData.inventory) {
        playerData.inventory = {};
      }

      // Add starting equipment to inventory
      for (const equipment of rpgClass.startingEquipment) {
        const normalizedEquipment = this.normalizeEquipmentName(equipment);
        playerData.inventory[normalizedEquipment] = (playerData.inventory[normalizedEquipment] || 0) + 1;
      }

      // Save updated player data
      await this.store.set(`player_${playerId}`, playerData);
      
      console.log(`[Class Selection] Gave starting equipment to ${playerId}: ${rpgClass.startingEquipment.join(', ')}`);
    } catch (error) {
      console.error(`[Class Selection] Error giving starting equipment to ${playerId}:`, error);
    }
  }

  /**
   * Normalize equipment names for inventory storage
   */
  private normalizeEquipmentName(equipment: string): string {
    return equipment.toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Get class selection help message
   */
  getClassSelectionHelp(): string {
    return this.classesService.getClassSelectionMessage();
  }

  /**
   * Check if player needs to select a class
   */
  async playerNeedsClassSelection(playerId: string): Promise<boolean> {
    return !(await this.classesService.hasPlayerSelectedClass(playerId));
  }
}
