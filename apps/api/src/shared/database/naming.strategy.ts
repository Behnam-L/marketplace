import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

const snake = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();

/** snake_case tables and columns. */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(className: string, customName?: string): string {
    return customName ?? snake(className);
  }

  override columnName(propertyName: string, customName: string | undefined, prefixes: string[]): string {
    return snake([...prefixes, customName ?? propertyName].join('_'));
  }

  override relationName(propertyName: string): string {
    return snake(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }
}
