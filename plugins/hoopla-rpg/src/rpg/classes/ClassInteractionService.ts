/**
 * Class Interaction Service
 * 
 * Handles class-specific brick interactions and their effects.
 */

import { OL, PS } from 'omegga';
import { RPGClassesService } from './RPGClassesService';

export class ClassInteractionService {
  private omegga: OL;
  private store: PS<any>;
  private classesService: RPGClassesService;

  constructor(omegga: OL, store: PS<any>, classesService: RPGClassesService) {
    this.omegga = omegga;
    this.store = store;
    this.classesService = classesService;
  }

  /**
   * Handle class-specific brick interactions
   */
  async handleClassInteraction(playerId: string, brickType: string): Promise<{ success: boolean; message: string; reward?: any }> {
    const playerClass = await this.classesService.getPlayerClass(playerId);
    
    if (!playerClass) {
      return {
        success: false,
        message: '<color="f00">You must select a class first!</color>\n<color="fff">Use /rpg select [class] to choose your class.</color>'
      };
    }

    // Check if player can interact with this brick type
    const canInteract = await this.classesService.canPlayerInteractWithBrick(playerId, brickType);
    if (!canInteract) {
      const requiredClass = this.classesService.getClassForBrickType(brickType);
      if (requiredClass) {
        return {
          success: false,
          message: this.classesService.getClassDenialMessage(requiredClass, brickType)
        };
      }
    }

    // Handle specific brick interactions
    switch (brickType) {
      case 'rpg_warrior_boulder':
        return await this.handleWarriorBoulder(playerId);
      
      case 'rpg_mage_portal':
        return await this.handleMagePortal(playerId);
      
      case 'rpg_pirate_treasure':
        return await this.handlePirateTreasure(playerId);
      
      default:
        return {
          success: false,
          message: '<color="f00">Unknown class interaction type!</color>'
        };
    }
  }

  /**
   * Handle Warrior Boulder interaction (teleportation)
   */
  private async handleWarriorBoulder(playerId: string): Promise<{ success: boolean; message: string; reward?: any }> {
    try {
      // Add class XP for successful interaction
      await this.classesService.addClassXP(playerId, 50);
      
      // TODO: Implement teleportation logic
      // For now, just provide feedback
      const message = '<color="0f0">🗡️ Warrior Boulder</color>\n<color="fff">You push the massive boulder aside with your strength!</color>\n<color="ff0">+50 Warrior XP</color>';
      
      return {
        success: true,
        message: message,
        reward: { xp: 50, type: 'warrior_xp' }
      };
    } catch (error) {
      console.error(`[Class Interaction] Error handling warrior boulder for ${playerId}:`, error);
      return {
        success: false,
        message: '<color="f00">Error interacting with warrior boulder!</color>'
      };
    }
  }

  /**
   * Handle Mage Portal interaction (teleportation)
   */
  private async handleMagePortal(playerId: string): Promise<{ success: boolean; message: string; reward?: any }> {
    try {
      // Add class XP for successful interaction
      await this.classesService.addClassXP(playerId, 50);
      
      // TODO: Implement teleportation logic
      // For now, just provide feedback
      const message = '<color="0f0">🧙‍♂️ Mage Portal</color>\n<color="fff">You channel your magical energy into the portal!</color>\n<color="ff0">+50 Mage XP</color>';
      
      return {
        success: true,
        message: message,
        reward: { xp: 50, type: 'mage_xp' }
      };
    } catch (error) {
      console.error(`[Class Interaction] Error handling mage portal for ${playerId}:`, error);
      return {
        success: false,
        message: '<color="f00">Error interacting with mage portal!</color>'
      };
    }
  }

  /**
   * Handle Pirate Treasure interaction (RNG money)
   */
  private async handlePirateTreasure(playerId: string): Promise<{ success: boolean; message: string; reward?: any }> {
    try {
      // Generate weighted random money reward
      const moneyReward = this.generateTreasureReward();
      
      // Add class XP for successful interaction
      await this.classesService.addClassXP(playerId, 50);
      
      // TODO: Add money to player's currency
      // For now, just provide feedback
      const message = `<color="0f0">🏴‍☠️ Pirate Treasure</color>\n<color="fff">You discover a hidden treasure!</color>\n<color="ff0">+$${moneyReward} +50 Pirate XP</color>`;
      
      return {
        success: true,
        message: message,
        reward: { money: moneyReward, xp: 50, type: 'pirate_treasure' }
      };
    } catch (error) {
      console.error(`[Class Interaction] Error handling pirate treasure for ${playerId}:`, error);
      return {
        success: false,
        message: '<color="f00">Error interacting with pirate treasure!</color>'
      };
    }
  }

  /**
   * Generate weighted random treasure reward ($1-$500)
   */
  private generateTreasureReward(): number {
    // Weighted probability: higher amounts are increasingly rare
    const random = Math.random();
    
    if (random < 0.4) {
      // 40% chance: $1-$50
      return Math.floor(Math.random() * 50) + 1;
    } else if (random < 0.7) {
      // 30% chance: $51-$150
      return Math.floor(Math.random() * 100) + 51;
    } else if (random < 0.85) {
      // 15% chance: $151-$300
      return Math.floor(Math.random() * 150) + 151;
    } else if (random < 0.95) {
      // 10% chance: $301-$450
      return Math.floor(Math.random() * 150) + 301;
    } else {
      // 5% chance: $451-$500 (rare)
      return Math.floor(Math.random() * 50) + 451;
    }
  }

  /**
   * Check if a brick type is a class interaction
   */
  isClassInteraction(brickType: string): boolean {
    return this.classesService.isClassSpecificBrick(brickType);
  }
}
