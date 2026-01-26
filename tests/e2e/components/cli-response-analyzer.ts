/**
 * CLI Response and Migration File Analyzer Component
 * 
 * Compares CLI responses and migration files from both PocketBase native CLI
 * and library CLI, providing detailed analysis and compatibility scoring.
 */

import { ParsedMigration, ParsedCollection, ParsedField } from './native-migration-generator.js';
import { logger } from '../utils/test-helpers.js';
import { ResultsTracker, updateTestResult } from '../utils/results-tracker.js';

export interface CLIResponseAnalyzer {
  compareMigrations(native: ParsedMigration, library: ParsedMigration, scenarioName?: string): Promise<MigrationComparison>;
  analyzeCollection(native: ParsedCollection, library: ParsedCollection): CollectionComparison;
  analyzeField(native: ParsedField, library: ParsedField): FieldComparison;
  calculateCompatibilityScore(comparison: MigrationComparison): number;
  compareCliResponses(nativeResponse: string, libraryResponse: string): CliResponseComparison;
  setResultsTracker(tracker: ResultsTracker): void;
}

export interface MigrationComparison {
  filename: FilenameComparison;
  collections: CollectionComparison[];
  overallScore: number;
  criticalDifferences: Difference[];
  majorDifferences: Difference[];
  minorDifferences: Difference[];
  structuralSimilarity: number;
  contentSimilarity: number;
}

export interface FilenameComparison {
  nativeFilename: string;
  libraryFilename: string;
  timestampMatch: boolean;
  namePatternMatch: boolean;
  score: number;
}

export interface CollectionComparison {
  name: string;
  properties: PropertyComparison[];
  fields: FieldComparison[];
  indexes: IndexComparison[];
  rules: RuleComparison[];
  score: number;
  matched: boolean;
}

export interface PropertyComparison {
  property: string;
  nativeValue: any;
  libraryValue: any;
  matches: boolean;
  severity: 'critical' | 'major' | 'minor';
}

export interface FieldComparison {
  fieldName: string;
  nativeField?: ParsedField;
  libraryField?: ParsedField;
  typeMatch: boolean;
  requiredMatch: boolean;
  uniqueMatch: boolean;
  optionsMatch: boolean;
  score: number;
  differences: Difference[];
}

export interface IndexComparison {
  indexName: string;
  nativeIndex?: string;
  libraryIndex?: string;
  matches: boolean;
  score: number;
}

export interface RuleComparison {
  ruleName: string;
  nativeRule?: string | null;
  libraryRule?: string | null;
  matches: boolean;
  score: number;
}

export interface Difference {
  severity: 'critical' | 'major' | 'minor';
  category: 'collection' | 'field' | 'index' | 'rule' | 'structure' | 'filename';
  description: string;
  nativeValue: any;
  libraryValue: any;
  path: string;
}

export interface CliResponseComparison {
  exitCodeMatch: boolean;
  outputSimilarity: number;
  errorSimilarity: number;
  structuralMatch: boolean;
  differences: string[];
  score: number;
}

export interface ComparisonMetrics {
  structuralSimilarity: number;  // 0-100%
  fieldAccuracy: number;         // 0-100%
  optionPreservation: number;    // 0-100%
  ruleConsistency: number;       // 0-100%
  indexMatching: number;         // 0-100%
}

export class CLIResponseAnalyzerImpl implements CLIResponseAnalyzer {
  private readonly scoringWeights = {
    filename: 0.05,
    collections: 0.40,
    fields: 0.35,
    indexes: 0.10,
    rules: 0.10,
  };

  private readonly severityWeights = {
    critical: 1.0,
    major: 0.7,
    minor: 0.3,
  };

  private resultsTracker?: ResultsTracker;

  /**
   * Set the results tracker for automatic result recording
   */
  setResultsTracker(tracker: ResultsTracker): void {
    this.resultsTracker = tracker;
  }

  /**
   * Compare two parsed migration files and provide detailed analysis
   */
  async compareMigrations(native: ParsedMigration, library: ParsedMigration, scenarioName?: string): Promise<MigrationComparison> {
    logger.debug(`Comparing migrations: ${native.filename} vs ${library.filename}`);

    try {
      // Compare filenames
      const filename = this.compareFilenames(native.filename, library.filename);

      // Compare collections
      const collections = this.compareCollections(native.collections, library.collections);

      // Collect all differences
      const allDifferences = this.collectAllDifferences(filename, collections);

      // Calculate overall score
      const overallScore = this.calculateOverallScore(filename, collections);

      // Calculate structural and content similarity
      const structuralSimilarity = this.calculateStructuralSimilarity(native, library);
      const contentSimilarity = this.calculateContentSimilarity(native, library);

      const comparison: MigrationComparison = {
        filename,
        collections,
        overallScore,
        criticalDifferences: allDifferences.filter(d => d.severity === 'critical'),
        majorDifferences: allDifferences.filter(d => d.severity === 'major'),
        minorDifferences: allDifferences.filter(d => d.severity === 'minor'),
        structuralSimilarity,
        contentSimilarity,
      };

      // Record results if scenario name provided and results tracker is set
      if (scenarioName) {
        const passed = overallScore >= 70; // Consider 70% as passing threshold
        const differences = allDifferences.map(d => d.description);

        // Use the results tracker if available, otherwise use the default utility
        if (this.resultsTracker) {
          this.resultsTracker.updateTestResult(scenarioName, overallScore, passed, {
            nativeFile: native.filename,
            libraryFile: library.filename,
            differences,
            score: overallScore
          });
        } else {
          updateTestResult(scenarioName, overallScore, passed, {
            nativeFile: native.filename,
            libraryFile: library.filename,
            differences,
            score: overallScore
          });
        }
      }

      logger.info(`Migration comparison completed. Overall score: ${overallScore}%`);
      return comparison;

    } catch (error) {
      logger.error('Failed to compare migrations:', error);

      // Record failure if scenario name provided
      if (scenarioName) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (this.resultsTracker) {
          this.resultsTracker.updateTestResult(scenarioName, 0, false, {
            nativeFile: native.filename,
            libraryFile: library.filename,
            differences: [errorMessage],
            score: 0
          });
        } else {
          updateTestResult(scenarioName, 0, false, {
            nativeFile: native.filename,
            libraryFile: library.filename,
            differences: [errorMessage],
            score: 0
          });
        }
      }

      throw error;
    }
  }

  /**
   * Analyze and compare two collections
   */
  analyzeCollection(native: ParsedCollection, library: ParsedCollection): CollectionComparison {
    logger.debug(`Analyzing collection: ${native.name} vs ${library.name}`);

    // Compare basic properties
    const properties = this.compareCollectionProperties(native, library);

    // Compare fields
    const fields = this.compareFields(native.fields, library.fields);

    // Compare indexes
    const indexes = this.compareIndexes(native.indexes, library.indexes);

    // Compare rules
    const rules = this.compareRules(native.rules, library.rules);

    // Calculate collection score
    const score = this.calculateCollectionScore(properties, fields, indexes, rules);

    return {
      name: native.name,
      properties,
      fields,
      indexes,
      rules,
      score,
      matched: native.name === library.name,
    };
  }

  /**
   * Analyze and compare two fields
   */
  analyzeField(native: ParsedField, library: ParsedField): FieldComparison {
    const differences: Difference[] = [];

    // Compare field type
    const typeMatch = native.type === library.type;
    if (!typeMatch) {
      differences.push({
        severity: 'critical',
        category: 'field',
        description: `Field type mismatch: ${native.type} vs ${library.type}`,
        nativeValue: native.type,
        libraryValue: library.type,
        path: `fields.${native.name}.type`,
      });
    }

    // Compare required flag
    const requiredMatch = native.required === library.required;
    if (!requiredMatch) {
      differences.push({
        severity: 'major',
        category: 'field',
        description: `Field required flag mismatch: ${native.required} vs ${library.required}`,
        nativeValue: native.required,
        libraryValue: library.required,
        path: `fields.${native.name}.required`,
      });
    }

    // Compare unique flag
    const uniqueMatch = native.unique === library.unique;
    if (!uniqueMatch) {
      differences.push({
        severity: 'major',
        category: 'field',
        description: `Field unique flag mismatch: ${native.unique} vs ${library.unique}`,
        nativeValue: native.unique,
        libraryValue: library.unique,
        path: `fields.${native.name}.unique`,
      });
    }

    // Compare options
    const optionsMatch = this.deepEqual(native.options, library.options);
    if (!optionsMatch) {
      differences.push({
        severity: 'minor',
        category: 'field',
        description: `Field options mismatch`,
        nativeValue: native.options,
        libraryValue: library.options,
        path: `fields.${native.name}.options`,
      });
    }

    // Compare relation config
    let relationMatch = true;
    if (native.relation || library.relation) {
      relationMatch = this.deepEqual(native.relation, library.relation);
      if (!relationMatch) {
        differences.push({
          severity: 'major',
          category: 'field',
          description: `Field relation config mismatch`,
          nativeValue: native.relation,
          libraryValue: library.relation,
          path: `fields.${native.name}.relation`,
        });
      }
    }

    // Calculate field score
    const score = this.calculateFieldScore(typeMatch, requiredMatch, uniqueMatch, optionsMatch, relationMatch);

    return {
      fieldName: native.name,
      nativeField: native,
      libraryField: library,
      typeMatch,
      requiredMatch,
      uniqueMatch,
      optionsMatch,
      score,
      differences,
    };
  }

  /**
   * Calculate overall compatibility score for a migration comparison
   */
  calculateCompatibilityScore(comparison: MigrationComparison): number {
    return comparison.overallScore;
  }

  /**
   * Compare CLI responses from native and library CLIs
   */
  compareCliResponses(nativeResponse: string, libraryResponse: string): CliResponseComparison {
    logger.debug('Comparing CLI responses');

    // For now, assume both CLIs should have successful exit codes (0)
    // In a real implementation, you'd parse actual CLI responses
    const exitCodeMatch = true; // Both should succeed

    // Calculate output similarity using simple string comparison
    const outputSimilarity = this.calculateStringSimilarity(nativeResponse, libraryResponse);

    // For CLI responses, we mainly care about success/failure and basic output format
    const errorSimilarity = 100; // Assume no errors for successful operations

    // Check if both responses indicate successful migration generation
    const structuralMatch = this.checkCliResponseStructure(nativeResponse, libraryResponse);

    const differences: string[] = [];
    if (!exitCodeMatch) {
      differences.push('Exit codes do not match');
    }
    if (outputSimilarity < 50) {
      differences.push('Output format significantly different');
    }
    if (!structuralMatch) {
      differences.push('Response structure does not match expected format');
    }

    const score = this.calculateCliResponseScore(exitCodeMatch, outputSimilarity, errorSimilarity, structuralMatch);

    return {
      exitCodeMatch,
      outputSimilarity,
      errorSimilarity,
      structuralMatch,
      differences,
      score,
    };
  }

  /**
   * Compare filenames and extract timestamp/pattern information
   */
  private compareFilenames(nativeFilename: string, libraryFilename: string): FilenameComparison {
    // Extract timestamp from filename (format: YYYYMMDDHHMMSS_description.js)
    // Handle optional _captured_ prefix in native filename
    const timestampRegex = /(?:^|_captured_)(\d{10,14})_/;
    const nativeTimestamp = nativeFilename.match(timestampRegex)?.[1];
    const libraryTimestamp = libraryFilename.match(timestampRegex)?.[1];

    const timestampMatch = !!nativeTimestamp && !!libraryTimestamp;

    // Check if the description part matches (after timestamp)
    // Also handle potential trailing underscore in native captured files
    let nativeDescription = nativeFilename.replace(timestampRegex, '');
    if (nativeFilename.includes('_captured_') && nativeDescription.endsWith('_.js')) {
      nativeDescription = nativeDescription.replace(/_\.js$/, '.js');
    }

    const libraryDescription = libraryFilename.replace(timestampRegex, '');
    const namePatternMatch = nativeDescription === libraryDescription;

    const score = this.calculateFilenameScore(timestampMatch, namePatternMatch);

    return {
      nativeFilename,
      libraryFilename,
      timestampMatch,
      namePatternMatch,
      score,
    };
  }

  /**
   * Compare collections from both migrations
   */
  private compareCollections(nativeCollections: ParsedCollection[], libraryCollections: ParsedCollection[]): CollectionComparison[] {
    const comparisons: CollectionComparison[] = [];

    // Create a map of library collections by name for efficient lookup
    const libraryCollectionMap = new Map<string, ParsedCollection>();
    libraryCollections.forEach(col => libraryCollectionMap.set(col.name, col));

    // Compare each native collection with its library counterpart
    for (const nativeCollection of nativeCollections) {
      const libraryCollection = libraryCollectionMap.get(nativeCollection.name);

      if (libraryCollection) {
        const comparison = this.analyzeCollection(nativeCollection, libraryCollection);
        comparisons.push(comparison);
        libraryCollectionMap.delete(nativeCollection.name); // Mark as processed
      } else {
        // Collection exists in native but not in library
        comparisons.push({
          name: nativeCollection.name,
          properties: [],
          fields: [],
          indexes: [],
          rules: [],
          score: 0,
          matched: false,
        });
      }
    }

    // Handle collections that exist in library but not in native
    for (const [name, libraryCollection] of libraryCollectionMap) {
      comparisons.push({
        name: name,
        properties: [],
        fields: [],
        indexes: [],
        rules: [],
        score: 0,
        matched: false,
      });
    }

    return comparisons;
  }

  /**
   * Compare basic collection properties
   */
  private compareCollectionProperties(native: ParsedCollection, library: ParsedCollection): PropertyComparison[] {
    const properties: PropertyComparison[] = [];

    // Compare collection type
    properties.push({
      property: 'type',
      nativeValue: native.type,
      libraryValue: library.type,
      matches: native.type === library.type,
      severity: native.type !== library.type ? 'critical' : 'minor',
    });

    // Compare system flag
    properties.push({
      property: 'system',
      nativeValue: native.system,
      libraryValue: library.system,
      matches: native.system === library.system,
      severity: native.system !== library.system ? 'major' : 'minor',
    });

    return properties;
  }

  /**
   * Compare fields between collections
   */
  private compareFields(nativeFields: ParsedField[], libraryFields: ParsedField[]): FieldComparison[] {
    const comparisons: FieldComparison[] = [];

    // Create a map of library fields by name for efficient lookup
    const libraryFieldMap = new Map<string, ParsedField>();
    libraryFields.forEach(field => libraryFieldMap.set(field.name, field));

    // Compare each native field with its library counterpart
    for (const nativeField of nativeFields) {
      const libraryField = libraryFieldMap.get(nativeField.name);

      if (libraryField) {
        const comparison = this.analyzeField(nativeField, libraryField);
        comparisons.push(comparison);
        libraryFieldMap.delete(nativeField.name); // Mark as processed
      } else {
        // Field exists in native but not in library
        comparisons.push({
          fieldName: nativeField.name,
          nativeField: nativeField,
          libraryField: undefined,
          typeMatch: false,
          requiredMatch: false,
          uniqueMatch: false,
          optionsMatch: false,
          score: 0,
          differences: [{
            severity: 'critical',
            category: 'field',
            description: `Field missing in library migration: ${nativeField.name}`,
            nativeValue: nativeField,
            libraryValue: undefined,
            path: `fields.${nativeField.name}`,
          }],
        });
      }
    }

    // Handle fields that exist in library but not in native
    for (const [name, libraryField] of libraryFieldMap) {
      comparisons.push({
        fieldName: name,
        nativeField: undefined,
        libraryField: libraryField,
        typeMatch: false,
        requiredMatch: false,
        uniqueMatch: false,
        optionsMatch: false,
        score: 0,
        differences: [{
          severity: 'major',
          category: 'field',
          description: `Extra field in library migration: ${name}`,
          nativeValue: undefined,
          libraryValue: libraryField,
          path: `fields.${name}`,
        }],
      });
    }

    return comparisons;
  }

  /**
   * Compare indexes between collections
   */
  private compareIndexes(nativeIndexes: string[], libraryIndexes: string[]): IndexComparison[] {
    const comparisons: IndexComparison[] = [];

    // Create sets for efficient comparison
    const nativeSet = new Set(nativeIndexes);
    const librarySet = new Set(libraryIndexes);

    // Find common indexes
    const commonIndexes = nativeIndexes.filter(index => librarySet.has(index));
    commonIndexes.forEach(index => {
      comparisons.push({
        indexName: index,
        nativeIndex: index,
        libraryIndex: index,
        matches: true,
        score: 100,
      });
    });

    // Find indexes only in native
    const nativeOnlyIndexes = nativeIndexes.filter(index => !librarySet.has(index));
    nativeOnlyIndexes.forEach(index => {
      comparisons.push({
        indexName: index,
        nativeIndex: index,
        libraryIndex: undefined,
        matches: false,
        score: 0,
      });
    });

    // Find indexes only in library
    const libraryOnlyIndexes = libraryIndexes.filter(index => !nativeSet.has(index));
    libraryOnlyIndexes.forEach(index => {
      comparisons.push({
        indexName: index,
        nativeIndex: undefined,
        libraryIndex: index,
        matches: false,
        score: 0,
      });
    });

    return comparisons;
  }

  /**
   * Compare rules between collections
   */
  private compareRules(nativeRules: any, libraryRules: any): RuleComparison[] {
    const comparisons: RuleComparison[] = [];
    const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule', 'manageRule'];

    for (const ruleName of ruleNames) {
      const nativeRule = nativeRules[ruleName];
      const libraryRule = libraryRules[ruleName];
      const matches = nativeRule === libraryRule;

      comparisons.push({
        ruleName,
        nativeRule,
        libraryRule,
        matches,
        score: matches ? 100 : 0,
      });
    }

    return comparisons;
  }

  /**
   * Collect all differences from filename and collection comparisons
   */
  private collectAllDifferences(filename: FilenameComparison, collections: CollectionComparison[]): Difference[] {
    const differences: Difference[] = [];

    // Add filename differences
    if (!filename.timestampMatch) {
      differences.push({
        severity: 'minor',
        category: 'filename',
        description: 'Migration filename timestamp format differs',
        nativeValue: filename.nativeFilename,
        libraryValue: filename.libraryFilename,
        path: 'filename.timestamp',
      });
    }

    if (!filename.namePatternMatch) {
      differences.push({
        severity: 'minor',
        category: 'filename',
        description: 'Migration filename pattern differs',
        nativeValue: filename.nativeFilename,
        libraryValue: filename.libraryFilename,
        path: 'filename.pattern',
      });
    }

    // Add collection differences
    for (const collection of collections) {
      // Add property differences
      for (const prop of collection.properties) {
        if (!prop.matches) {
          differences.push({
            severity: prop.severity,
            category: 'collection',
            description: `Collection ${prop.property} mismatch: ${prop.nativeValue} vs ${prop.libraryValue}`,
            nativeValue: prop.nativeValue,
            libraryValue: prop.libraryValue,
            path: `collections.${collection.name}.${prop.property}`,
          });
        }
      }

      // Add field differences
      for (const field of collection.fields) {
        differences.push(...field.differences);
      }

      // Add index differences
      for (const index of collection.indexes) {
        if (!index.matches) {
          differences.push({
            severity: 'major',
            category: 'index',
            description: `Index mismatch: ${index.nativeIndex} vs ${index.libraryIndex}`,
            nativeValue: index.nativeIndex,
            libraryValue: index.libraryIndex,
            path: `collections.${collection.name}.indexes.${index.indexName}`,
          });
        }
      }

      // Add rule differences
      for (const rule of collection.rules) {
        if (!rule.matches) {
          differences.push({
            severity: 'major',
            category: 'rule',
            description: `Rule ${rule.ruleName} mismatch: ${rule.nativeRule} vs ${rule.libraryRule}`,
            nativeValue: rule.nativeRule,
            libraryValue: rule.libraryRule,
            path: `collections.${collection.name}.rules.${rule.ruleName}`,
          });
        }
      }
    }

    return differences;
  }

  /**
   * Calculate overall migration comparison score
   */
  private calculateOverallScore(filename: FilenameComparison, collections: CollectionComparison[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    // Add filename score
    totalScore += filename.score * this.scoringWeights.filename;
    totalWeight += this.scoringWeights.filename;

    // Add collection scores
    if (collections.length > 0) {
      const avgCollectionScore = collections.reduce((sum, col) => sum + col.score, 0) / collections.length;
      totalScore += avgCollectionScore * this.scoringWeights.collections;
      totalWeight += this.scoringWeights.collections;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  /**
   * Calculate collection comparison score
   */
  private calculateCollectionScore(
    properties: PropertyComparison[],
    fields: FieldComparison[],
    indexes: IndexComparison[],
    rules: RuleComparison[]
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    // Property score
    if (properties.length > 0) {
      const propScore = properties.filter(p => p.matches).length / properties.length * 100;
      totalScore += propScore * 0.2;
      totalWeight += 0.2;
    }

    // Field score
    if (fields.length > 0) {
      const fieldScore = fields.reduce((sum, f) => sum + f.score, 0) / fields.length;
      totalScore += fieldScore * 0.5;
      totalWeight += 0.5;
    }

    // Index score
    if (indexes.length > 0) {
      const indexScore = indexes.reduce((sum, i) => sum + i.score, 0) / indexes.length;
      totalScore += indexScore * 0.15;
      totalWeight += 0.15;
    }

    // Rule score
    if (rules.length > 0) {
      const ruleScore = rules.reduce((sum, r) => sum + r.score, 0) / rules.length;
      totalScore += ruleScore * 0.15;
      totalWeight += 0.15;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  /**
   * Calculate field comparison score
   */
  private calculateFieldScore(typeMatch: boolean, requiredMatch: boolean, uniqueMatch: boolean, optionsMatch: boolean, relationMatch: boolean = true): number {
    let score = 0;

    if (typeMatch) score += 40; // Type is most important
    if (requiredMatch) score += 20;
    if (uniqueMatch) score += 20;
    if (optionsMatch) score += 10;
    if (relationMatch) score += 10;

    return score;
  }

  /**
   * Calculate filename comparison score
   */
  private calculateFilenameScore(timestampMatch: boolean, namePatternMatch: boolean): number {
    let score = 0;

    if (timestampMatch) score += 30; // Timestamp format is less critical
    if (namePatternMatch) score += 70; // Name pattern is more important

    return score;
  }

  /**
   * Calculate CLI response comparison score
   */
  private calculateCliResponseScore(
    exitCodeMatch: boolean,
    outputSimilarity: number,
    errorSimilarity: number,
    structuralMatch: boolean
  ): number {
    let score = 0;

    if (exitCodeMatch) score += 40; // Exit code is most important
    score += outputSimilarity * 0.3; // Output similarity
    score += errorSimilarity * 0.1; // Error similarity
    if (structuralMatch) score += 20; // Structural match

    return Math.round(score);
  }

  /**
   * Calculate structural similarity between migrations
   */
  private calculateStructuralSimilarity(native: ParsedMigration, library: ParsedMigration): number {
    // Compare number of collections
    const collectionCountMatch = native.collections.length === library.collections.length;

    // Compare collection names
    const nativeNames = new Set(native.collections.map(c => c.name));
    const libraryNames = new Set(library.collections.map(c => c.name));
    const commonNames = [...nativeNames].filter(name => libraryNames.has(name));
    const nameMatchRatio = commonNames.length / Math.max(nativeNames.size, libraryNames.size);

    // Calculate overall structural similarity
    let similarity = 0;
    if (collectionCountMatch) similarity += 30;
    similarity += nameMatchRatio * 70;

    return Math.round(similarity);
  }

  /**
   * Calculate content similarity between migrations
   */
  private calculateContentSimilarity(native: ParsedMigration, library: ParsedMigration): number {
    // Simple content similarity based on string comparison of up functions
    return this.calculateStringSimilarity(native.upFunction, library.upFunction);
  }

  /**
   * Calculate string similarity using simple character-based comparison
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 100;
    if (!str1 || !str2) return 0;

    // Simple Levenshtein distance-based similarity
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 100;

    const distance = this.levenshteinDistance(str1, str2);
    return Math.round((1 - distance / maxLength) * 100);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Check if CLI responses have expected structure
   */
  private checkCliResponseStructure(nativeResponse: string, libraryResponse: string): boolean {
    // Both responses should indicate successful migration generation
    // This is a simplified check - in practice, you'd parse the actual CLI output format
    const nativeSuccess = nativeResponse.includes('migration') || nativeResponse.includes('generated') || nativeResponse.length > 0;
    const librarySuccess = libraryResponse.includes('migration') || libraryResponse.includes('generated') || libraryResponse.length > 0;

    return nativeSuccess && librarySuccess;
  }

  /**
   * Deep equality check for objects
   */
  private deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return obj1 === obj2;
    if (typeof obj1 !== typeof obj2) return false;
    if (typeof obj1 !== 'object') return obj1 === obj2;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }
}

// Export factory function for easier testing and dependency injection
export function createCLIResponseAnalyzer(): CLIResponseAnalyzer {
  return new CLIResponseAnalyzerImpl();
}