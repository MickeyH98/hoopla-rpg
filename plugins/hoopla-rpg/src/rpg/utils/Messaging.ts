/**
 * Messaging Utilities
 * 
 * Provides utility functions for handling long messages and communication
 * with players in the RPG system.
 */

import { OL } from "omegga";

/**
 * Service class for handling player messaging
 */
export class MessagingService {
  private omegga: OL;

  constructor(omegga: OL) {
    this.omegga = omegga;
  }

  /**
   * Sends a long message to a player by splitting it into multiple whispers
   * if it exceeds the character limit.
   * 
   * @param playerId - The ID of the player to send the message to
   * @param message - The message to send
   * @param maxLength - Maximum length per message chunk (default: 200)
   */
  sendLongMessage(playerId: string, message: string, maxLength: number = 200): void {
    // Split message into chunks that fit within the character limit
    const chunks = [];
    let currentChunk = '';
    
    // Split by words to avoid breaking words
    const words = message.split(' ');
    
    for (const word of words) {
      // Check if adding this word would exceed the limit
      if (currentChunk.length + word.length + 1 > maxLength && currentChunk.length > 0) {
        // Current chunk is full, add it to chunks and start a new one
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        // Add word to current chunk
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + word;
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    // Send each chunk as a separate whisper
    for (const chunk of chunks) {
      this.omegga.whisper(playerId, chunk);
    }
  }

  /**
   * Sends a message to a player using the middle print system
   * 
   * @param playerId - The ID of the player to send the message to
   * @param message - The message to display
   */
  sendMiddleMessage(playerId: string, message: string): void {
    this.omegga.middlePrint(playerId, message);
  }

  /**
   * Sends a whisper message to a player
   * 
   * @param playerId - The ID of the player to send the message to
   * @param message - The message to send
   */
  sendWhisper(playerId: string, message: string): void {
    this.omegga.whisper(playerId, message);
  }
}
