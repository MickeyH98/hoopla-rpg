/**
 * Progress Bar Utilities
 * 
 * Provides utility functions for creating visual progress bars
 * using text characters for the RPG system.
 */

/**
 * Service class for creating progress bars
 */
export class ProgressBarService {
  /**
   * Creates a visual progress bar using text characters
   * 
   * @param current - Current progress value
   * @param total - Total/maximum progress value
   * @param width - Width of the progress bar in characters (default: 20)
   * @returns Formatted progress bar string
   */
  createProgressBar(current: number, total: number, width: number = 20): string {
    const progress = Math.min(1, Math.max(0, current / total));
    const filledWidth = Math.round(progress * width);
    const emptyWidth = width - filledWidth;
    
    const filledChar = '='; // Equals character (will be colored green)
    const emptyChar = '-';  // Dash character (will be colored grey)
    
    const filledBar = filledChar.repeat(filledWidth);
    const emptyBar = emptyChar.repeat(emptyWidth);
    
    return `[${filledBar}${emptyBar}] ${Math.round(progress * 100)}%`;
  }

  /**
   * Creates a progress bar with custom characters
   * 
   * @param current - Current progress value
   * @param total - Total/maximum progress value
   * @param width - Width of the progress bar in characters
   * @param filledChar - Character to use for filled portion
   * @param emptyChar - Character to use for empty portion
   * @returns Formatted progress bar string
   */
  createCustomProgressBar(
    current: number, 
    total: number, 
    width: number = 20, 
    filledChar: string = '=', 
    emptyChar: string = '-'
  ): string {
    const progress = Math.min(1, Math.max(0, current / total));
    const filledWidth = Math.round(progress * width);
    const emptyWidth = width - filledWidth;
    
    const filledBar = filledChar.repeat(filledWidth);
    const emptyBar = emptyChar.repeat(emptyWidth);
    
    return `[${filledBar}${emptyBar}] ${Math.round(progress * 100)}%`;
  }

  /**
   * Creates a progress bar with percentage display only
   * 
   * @param current - Current progress value
   * @param total - Total/maximum progress value
   * @returns Percentage string
   */
  createPercentageBar(current: number, total: number): string {
    const progress = Math.min(1, Math.max(0, current / total));
    return `${Math.round(progress * 100)}%`;
  }

  /**
   * Creates a progress bar with fraction display
   * 
   * @param current - Current progress value
   * @param total - Total/maximum progress value
   * @param width - Width of the progress bar in characters
   * @returns Formatted progress bar with fraction
   */
  createFractionProgressBar(current: number, total: number, width: number = 20): string {
    const progress = Math.min(1, Math.max(0, current / total));
    const filledWidth = Math.round(progress * width);
    const emptyWidth = width - filledWidth;
    
    const filledBar = '='.repeat(filledWidth);
    const emptyBar = '-'.repeat(emptyWidth);
    
    return `[${filledBar}${emptyBar}] ${current}/${total}`;
  }
}
