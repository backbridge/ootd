export type PropertyCategory = 'updatable' | 'application' | 'internal' | 'readOnly';

export interface PropertyEntry {
  propertyKey: string;
  propertyValue: unknown;
}

export interface CategorizedProperties {
  updatable: PropertyEntry[];
  application: PropertyEntry[];
  internal: PropertyEntry[];
  readOnly: PropertyEntry[];
}

export const PROPERTY_PREFIXES: Record<string, PropertyCategory> = {
  'a_': 'application',
  'i_': 'internal',
  'r_': 'readOnly',
};

export function categorizeProperties(properties: Record<string, unknown>): CategorizedProperties {
  const categorized: CategorizedProperties = {
    updatable: [],
    application: [],
    internal: [],
    readOnly: [],
  };

  for (const [key, value] of Object.entries(properties)) {
    let category: PropertyCategory = 'updatable';

    if (key.startsWith('r_')) {
      category = 'readOnly';
    } else if (key.startsWith('i_')) {
      category = 'internal';
    } else if (key.startsWith('a_')) {
      category = 'application';
    }

    categorized[category].push({
      propertyKey: key,
      propertyValue: value,
    });
  }

  return categorized;
}
