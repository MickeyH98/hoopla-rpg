/**
 * currency.ts
 * voximity
 *
 * API wrapper over the omegga-currency plugin interop methods.
 * Feel free to use in your currency extension plugins.
 */

import { OL, PluginInterop } from "omegga";

export default class Currency {
  omegga: OL;
  plugin: PluginInterop;

  constructor(omegga: OL) {
    this.omegga = omegga;
  }

  private checkError<T>(value: T | { error: string }): T {
    if (!this.plugin) {
      throw "Plugin is not loaded";
    }

    if (value && typeof value === "object" && "error" in value) {
      throw value.error;
    }

    return value as T;
  }

  /**
   * Attempt to find and load the currency plugin into memory.
   *
   * This MUST be done when your plugin initializes.
   */
  async loadPlugin() {
    this.plugin = await this.omegga.getPlugin("currency");
    if (!this.plugin) {
      throw "The currency plugin could not be found. Is it installed and loaded?";
    }
  }

  /**
   * Get the player's entire data object in the currency store.
   */
  async getAll(playerId: string): Promise<any> {
    return this.checkError(await this.plugin.emitPlugin("get", [playerId]));
  }

  /**
   * Get the player's currency formatted given the server's configured prefix and decimal places.
   */
  async getCurrencyFormatted(playerId: string): Promise<string> {
    return this.checkError(
      await this.plugin.emitPlugin("currency", [playerId])
    );
  }

  /**
   * Get a value from the player's data in the store given a path.
   */
  async get<T>(playerId: string, path: string): Promise<T> {
    return this.checkError(
      await this.plugin.emitPlugin(`get.${path}`, [playerId])
    );
  }

  /**
   * Get the player's currency as a number.
   */
  async getCurrency(playerId: string): Promise<number> {
    return await this.get(playerId, "currency");
  }

  /**
   * Update the player's data.
   *
   * Example: `update(playerId, { currency: 500, otherData: 'hello' })`
   */
  async update<T>(playerId: string, data: T): Promise<void> {
    return this.checkError(
      await this.plugin.emitPlugin("update", [playerId, data])
    );
  }

  /**
   * Set a part of the player's data.
   *
   * Example: `set(playerId, 'currency', 500);`
   */
  async set<T>(playerId: string, path: string, value: T): Promise<void> {
    return this.checkError(
      await this.plugin.emitPlugin(`set.${path}`, [playerId, value])
    );
  }

  /**
   * Add a number to a field in the player's data,
   * or set it to that value if it was not in the data object already.
   *
   * Example: `add(playerId, 'currency', 10);`
   */
  async add(playerId: string, path: string, value: number): Promise<number> {
    return this.checkError(
      await this.plugin.emitPlugin(`add.${path}`, [playerId, value])
    );
  }

  /**
   * Push a value to an array in the player's data,
   * or set it to an array containing that value if unset.
   *
   * Example: `push(playerId, 'inventory', 'MyCoolItem');`
   */
  async push<T>(playerId: string, path: string, value: T): Promise<any[]> {
    return this.checkError(
      await this.plugin.emitPlugin(`push.${path}`, [playerId, value])
    );
  }

  /**
   * Delete a field from the player's data.
   *
   * Example: `delete(playerId, 'myField');`
   */
  async delete<T>(playerId: string, path: string): Promise<T> {
    return this.checkError(
      await this.plugin.emitPlugin(`delete.${path}`, [playerId])
    );
  }

  /**
   * Format a currency value given the configured prefix and decimal places.
   *
   * Example: `format(100);`
   */
  async format(value: number): Promise<string> {
    return this.checkError(await this.plugin.emitPlugin(`format`, [value]));
  }

  /**
   * Round a currency value given the decimal places in use by the plugin.
   *
   * Example: `round(100);`
   */
  async round(value: number): Promise<number> {
    return this.checkError(await this.plugin.emitPlugin(`round`, [value]));
  }
}
