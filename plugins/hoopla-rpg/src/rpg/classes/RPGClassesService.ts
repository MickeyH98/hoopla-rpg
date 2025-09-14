/**
 * RPG Classes Service
 * 
 * Manages the RPG class system, including class definitions, selection,
 * and class-specific brick interactions.
 */

import { OL, PS } from 'omegga';
import { XP_REQUIREMENTS, MAX_LEVEL } from '../progression/UnifiedXPService';

export interface RPGClass {
  id: string;
  name: string;
  description: string;
  startingEquipment: string[];
  specialBrickTypes: string[];
  classSpecificFeatures: string[];
}

export interface ClassProgress {
  classLevel: number; // class-specific level
  classXP: number; // class-specific experience
  lastUsed: number; // timestamp when this class was last used
}

export interface PlayerClassData {
  currentClass: string; // currently active class
  classes: { [classId: string]: ClassProgress }; // progress for each class
}

export class RPGClassesService {
  private omegga: OL;
  private store: PS<any>;

  // Class definitions
  private classes: { [classId: string]: RPGClass } = {
    warrior: {
      id: 'warrior',
      name: 'Warrior',
      description: 'Heavy melee combat specialist',
      startingEquipment: ['Weapon_LongSword'],
      specialBrickTypes: ['rpg_warrior_boulder'],
      classSpecificFeatures: ['Teleportation through boulder pushing', 'Strength-themed interactions']
    },
    mage: {
      id: 'mage',
      name: 'Mage',
      description: 'Magic and arcane knowledge specialist',
      startingEquipment: ['Weapon_HoloBlade'],
      specialBrickTypes: ['rpg_mage_portal'],
      classSpecificFeatures: ['Teleportation through magical portals', 'Arcane-themed interactions']
    },
    pirate: {
      id: 'pirate',
      name: 'Pirate',
      description: 'Naval combat and treasure hunting specialist',
      startingEquipment: ['Weapon_ArmingSword'],
      specialBrickTypes: ['rpg_pirate_treasure'],
      classSpecificFeatures: ['RNG money rewards', 'Treasure hunting interactions']
    }
  };

  constructor(omegga: OL, store: PS<any>) {
    this.omegga = omegga;
    this.store = store;
  }

  /**
   * Get all available classes
   */
  getAllClasses(): RPGClass[] {
    return Object.values(this.classes);
  }

  /**
   * Get a specific class by ID
   */
  getClass(classId: string): RPGClass | null {
    return this.classes[classId] || null;
  }

  /**
   * Get player's current class
   */
  async getPlayerClass(playerId: string): Promise<RPGClass | null> {
    try {
      const classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
      if (!classData || !classData.currentClass) {
        return null;
      }
      return this.getClass(classData.currentClass);
    } catch (error) {
      console.error(`[RPG Classes] Error getting player class for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Switch player's class (non-permanent, can switch between classes)
   */
  async setPlayerClass(playerId: string, classId: string): Promise<boolean> {
    try {
      const rpgClass = this.getClass(classId);
      if (!rpgClass) {
        return false;
      }

      // Get existing class data or create new
      let classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
      if (!classData) {
        classData = {
          currentClass: classId,
          classes: {}
        };
      }

      // Initialize class progress if it doesn't exist
      if (!classData.classes[classId]) {
        classData.classes[classId] = {
          classLevel: 0,
          classXP: 0,
          lastUsed: Date.now()
        };
      } else {
        // Update last used timestamp
        classData.classes[classId].lastUsed = Date.now();
      }

      // Set as current class
      classData.currentClass = classId;

      await this.store.set(`player_class_${playerId}`, classData);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if player has any class data
   */
  async hasPlayerSelectedClass(playerId: string): Promise<boolean> {
    const classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
    return classData !== null && classData.currentClass !== null;
  }

  /**
   * Get player's current class level and XP
   */
  async getPlayerClassLevel(playerId: string): Promise<{ level: number; xp: number } | null> {
    try {
      const classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
      if (!classData || !classData.currentClass) {
        return null;
      }
      
      const classProgress = classData.classes[classData.currentClass];
      if (!classProgress) {
        return null;
      }
      
      return {
        level: classProgress.classLevel || 0,
        xp: classProgress.classXP || 0
      };
    } catch (error) {
      console.error(`[RPG Classes] Error getting player class level for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Add class XP to player's current class
   */
  async addClassXP(playerId: string, xpAmount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    try {
      const classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
      if (!classData || !classData.currentClass) {
        console.error(`[RPG Classes] Player ${playerId} has no class selected`);
        return { leveledUp: false, newLevel: 0 };
      }

      const classProgress = classData.classes[classData.currentClass];
      if (!classProgress) {
        console.error(`[RPG Classes] Player ${playerId} has no progress for current class ${classData.currentClass}`);
        return { leveledUp: false, newLevel: 0 };
      }

      const oldLevel = classProgress.classLevel || 0;
      classProgress.classXP = (classProgress.classXP || 0) + xpAmount;

      // Calculate new level using the XP requirements lookup table
      let newLevel = 0;
      
      // Find the highest level the player can reach with their current XP
      for (let level = MAX_LEVEL; level >= 0; level--) {
        if (classProgress.classXP >= XP_REQUIREMENTS[level]) {
          newLevel = level;
          console.log(`[Hoopla RPG] Class Level ${level}: Cumulative XP needed ${XP_REQUIREMENTS[level]}, Current XP ${classProgress.classXP}`);
          break;
        }
      }
      classProgress.classLevel = newLevel;

      await this.store.set(`player_class_${playerId}`, classData);
      
      const leveledUp = newLevel > oldLevel;
      if (leveledUp) {
        const rpgClass = this.getClass(classData.currentClass);
        const playerName = this.omegga.getPlayer(playerId)?.name || `Player_${playerId.substring(0, 8)}`;
        this.omegga.broadcast(`<color="ff0">${playerName} reached ${rpgClass?.name} Level ${newLevel}!</color>`);
      }

      return { leveledUp, newLevel };
    } catch (error) {
      return { leveledUp: false, newLevel: 0 };
    }
  }


  /**
   * Reset player's class XP to 0
   */
  async resetPlayerClassXP(playerId: string): Promise<void> {
    try {
      const classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
      if (classData && classData.currentClass) {
        const classProgress = classData.classes[classData.currentClass];
        if (classProgress) {
          classProgress.classLevel = 0;
          classProgress.classXP = 0;
          await this.store.set(`player_class_${playerId}`, classData);
        }
      }
    } catch (error) {
      console.error(`[RPG Classes] Error resetting class XP for ${playerId}:`, error);
    }
  }

  /**
   * Check if a brick type is class-specific
   */
  isClassSpecificBrick(brickType: string): boolean {
    for (const rpgClass of Object.values(this.classes)) {
      if (rpgClass.specialBrickTypes.includes(brickType)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get which class can interact with a specific brick type
   */
  getClassForBrickType(brickType: string): RPGClass | null {
    for (const rpgClass of Object.values(this.classes)) {
      if (rpgClass.specialBrickTypes.includes(brickType)) {
        return rpgClass;
      }
    }
    return null;
  }

  /**
   * Check if player can interact with a class-specific brick
   */
  async canPlayerInteractWithBrick(playerId: string, brickType: string): Promise<boolean> {
    const playerClass = await this.getPlayerClass(playerId);
    if (!playerClass) {
      return false;
    }
    return playerClass.specialBrickTypes.includes(brickType);
  }

  /**
   * Get class selection message for new players
   */
  getClassSelectionMessage(): string {
    let message = '<color="ff0">Choose your RPG Class:</color>\n\n';
    
    for (const rpgClass of Object.values(this.classes)) {
      message += `<color="0ff">${rpgClass.name}</color>\n`;
      message += `<color="fff">${rpgClass.description}</color>\n`;
      message += `<color="ff0">Starting Equipment:</color> ${rpgClass.startingEquipment.map(eq => eq.replace('Weapon_', '')).join(', ')}\n\n`;
    }
    
    message += '<color="ff0">Interact with class selection bricks to choose your class!</color>\n';
    message += '<color="fff">You can switch between classes anytime and each class maintains separate progress.</color>';
    
    return message;
  }

  /**
   * Get class confirmation message
   */
  getClassConfirmationMessage(rpgClass: RPGClass): string {
    let message = `<color="0f0">Class Selected: ${rpgClass.name}</color>\n\n`;
    message += `<color="fff">${rpgClass.description}</color>\n\n`;
    message += '<color="ff0">Starting Equipment:</color>\n';
    
    for (const equipment of rpgClass.startingEquipment) {
      const displayName = equipment.replace('Weapon_', '');
      message += `• <color="0ff">${displayName}</color>\n`;
    }
    
    message += '\n<color="ff0">Special Features:</color>\n';
    for (const feature of rpgClass.classSpecificFeatures) {
      message += `• <color="0ff">${feature}</color>\n`;
    }
    
    message += '\n<color="0f0">You can switch between classes anytime using the class selection bricks!</color>';
    
    return message;
  }

  /**
   * Get class-specific interaction message
   */
  getClassInteractionMessage(rpgClass: RPGClass, brickType: string): string {
    const brickName = brickType.replace('rpg_', '').replace(/_/g, ' ');
    return `<color="0f0">${rpgClass.name} Class Access</color>\n<color="fff">You can interact with ${brickName} nodes!</color>`;
  }

  /**
   * Get class denial message for wrong class
   */
  getClassDenialMessage(requiredClass: RPGClass, brickType: string): string {
    const brickName = brickType.replace('rpg_', '').replace(/_/g, ' ');
    return `<color="f00">Access Denied</color>\n<color="fff">Only ${requiredClass.name}s can interact with ${brickName} nodes.</color>`;
  }

  /**
   * Get player's class status message
   */
  async getPlayerClassStatus(playerId: string): Promise<string> {
    const playerClass = await this.getPlayerClass(playerId);
    
    if (!playerClass) {
      return '<color="ff0">No class selected</color>\n<color="fff">Use /rpg select [class] to choose your class!</color>';
    }
    
    const classLevel = await this.getPlayerClassLevel(playerId);
    const level = classLevel?.level || 0;
    
    let message = `<color="0f0">Your Class: ${playerClass.name} Level ${level}</color>\n\n`;
    message += `<color="fff">${playerClass.description}</color>\n\n`;
    message += '<color="ff0">Special Brick Access:</color>\n';
    
    for (const brickType of playerClass.specialBrickTypes) {
      const brickName = brickType.replace('rpg_', '').replace(/_/g, ' ');
      message += `• <color="0ff">${brickName}</color>\n`;
    }
    
    return message;
  }

  /**
   * Get all class progress for a player
   */
  async getAllPlayerClassProgress(playerId: string): Promise<{ [classId: string]: ClassProgress } | null> {
    try {
      const classData = await this.store.get(`player_class_${playerId}`) as PlayerClassData;
      if (!classData) {
        return null;
      }
      return classData.classes;
    } catch (error) {
      console.error(`[RPG Classes] Error getting all class progress for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Get formatted class information for leaderboard display
   */
  async getPlayerClassDisplay(playerId: string): Promise<string> {
    const playerClass = await this.getPlayerClass(playerId);
    const classLevel = await this.getPlayerClassLevel(playerId);
    
    if (!playerClass || !classLevel) {
      return 'No Class';
    }
    
    return `${playerClass.name} L${classLevel.level}`;
  }
}
