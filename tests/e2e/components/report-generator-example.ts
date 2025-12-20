/**
 * Example usage of ReportGenerator component
 * 
 * This file demonstrates how to use the ReportGenerator to create
 * comprehensive test reports in different formats.
 */

import { createReportGenerator, TestResults } from './report-generator.js';
import { TestScenario } from '../fixtures/test-scenarios.js';
import { MigrationComparison } from './cli-response-analyzer.js';

/**
 * Example: Generate and save reports in all formats
 */
async function generateExampleReports() {
  const reportGenerator = createReportGenerator();

  // Create some example test results
  const testResults: TestResults[] = [
    {
      scenario: {
        name: 'basic-collection-test',
        description: 'Test basic collection creation with standard fields',
        category: 'basic',
        collectionDefinition: {
          name: 'posts',
          type: 'base',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'content', type: 'text', required: false },
            { name: 'published', type: 'bool', required: false },
          ],
        },
        expectedFeatures: ['text_fields', 'bool_field', 'required_validation'],
        minimumScore: 85,
      },
      migrationComparison: {
        filename: {
          nativeFilename: '1766188795_created_posts.js',
          libraryFilename: '1766188795_created_posts.js',
          timestampMatch: true,
          namePatternMatch: true,
          score: 100,
        },
        collections: [
          {
            name: 'posts',
            properties: [
              {
                property: 'type',
                nativeValue: 'base',
                libraryValue: 'base',
                matches: true,
                severity: 'minor',
              },
            ],
            fields: [
              {
                fieldName: 'title',
                nativeField: {
                  name: 'title',
                  type: 'text',
                  required: true,
                  unique: false,
                  options: { max: 255 },
                },
                libraryField: {
                  name: 'title',
                  type: 'text',
                  required: true,
                  unique: false,
                  options: { max: 255 },
                },
                typeMatch: true,
                requiredMatch: true,
                uniqueMatch: true,
                optionsMatch: true,
                score: 100,
                differences: [],
              },
            ],
            indexes: [],
            rules: [
              {
                ruleName: 'listRule',
                nativeRule: '',
                libraryRule: '',
                matches: true,
                score: 100,
              },
            ],
            score: 95,
            matched: true,
          },
        ],
        overallScore: 95,
        criticalDifferences: [],
        majorDifferences: [],
        minorDifferences: [],
        structuralSimilarity: 100,
        contentSimilarity: 95,
      },
      cliResponseComparison: {
        exitCodeMatch: true,
        outputSimilarity: 90,
        errorSimilarity: 100,
        structuralMatch: true,
        differences: [],
        score: 95,
      },
      executionTime: 1500,
      passed: true,
      nativeMigrationPath: '/tmp/native_posts.js',
      libraryMigrationPath: '/tmp/library_posts.js',
    },
    {
      scenario: {
        name: 'field-types-test',
        description: 'Test collection with various field types',
        category: 'field-types',
        collectionDefinition: {
          name: 'products',
          type: 'base',
          fields: [
            { name: 'name', type: 'text', required: true },
            { name: 'price', type: 'number', required: true, options: { min: 0 } },
            { name: 'description', type: 'editor', required: false },
            { name: 'available', type: 'bool', required: false },
          ],
        },
        expectedFeatures: ['text_field', 'number_field', 'editor_field', 'bool_field'],
        minimumScore: 80,
      },
      migrationComparison: {
        filename: {
          nativeFilename: '1766188800_created_products.js',
          libraryFilename: '1766188800_created_products.js',
          timestampMatch: true,
          namePatternMatch: true,
          score: 100,
        },
        collections: [
          {
            name: 'products',
            properties: [
              {
                property: 'type',
                nativeValue: 'base',
                libraryValue: 'base',
                matches: true,
                severity: 'minor',
              },
            ],
            fields: [
              {
                fieldName: 'price',
                nativeField: {
                  name: 'price',
                  type: 'number',
                  required: true,
                  unique: false,
                  options: { min: 0, onlyInt: false },
                },
                libraryField: {
                  name: 'price',
                  type: 'number',
                  required: true,
                  unique: false,
                  options: { min: 0 }, // Missing onlyInt option
                },
                typeMatch: true,
                requiredMatch: true,
                uniqueMatch: true,
                optionsMatch: false,
                score: 85,
                differences: [
                  {
                    severity: 'minor',
                    category: 'field',
                    description: 'Field options mismatch',
                    nativeValue: { min: 0, onlyInt: false },
                    libraryValue: { min: 0 },
                    path: 'fields.price.options',
                  },
                ],
              },
            ],
            indexes: [],
            rules: [],
            score: 85,
            matched: true,
          },
        ],
        overallScore: 85,
        criticalDifferences: [],
        majorDifferences: [],
        minorDifferences: [
          {
            severity: 'minor',
            category: 'field',
            description: 'Field options mismatch',
            nativeValue: { min: 0, onlyInt: false },
            libraryValue: { min: 0 },
            path: 'fields.price.options',
          },
        ],
        structuralSimilarity: 100,
        contentSimilarity: 85,
      },
      executionTime: 2200,
      passed: true,
    },
    {
      scenario: {
        name: 'failed-test',
        description: 'Test that demonstrates a failure scenario',
        category: 'indexes',
        collectionDefinition: {
          name: 'users',
          type: 'auth',
          fields: [
            { name: 'username', type: 'text', required: true, unique: true },
          ],
        },
        expectedFeatures: ['auth_collection', 'unique_constraint'],
        minimumScore: 90,
      },
      executionTime: 800,
      passed: false,
      error: 'Migration generation failed: Unique constraint not properly handled',
    },
  ];

  // Generate the comprehensive report
  console.log('Generating comprehensive test report...');
  const report = await reportGenerator.generateReport(testResults);

  // Display console report
  console.log('\n=== CONSOLE REPORT ===');
  const consoleReport = reportGenerator.generateConsoleReport(report);
  console.log(consoleReport);

  // Save reports in all formats
  console.log('Saving reports to files...');
  
  try {
    // Save console report
    await reportGenerator.saveReport(report, 'console', './example-reports/console-report.txt');
    console.log('✓ Console report saved to ./example-reports/console-report.txt');

    // Save JSON report
    await reportGenerator.saveReport(report, 'json', './example-reports/json-report.json');
    console.log('✓ JSON report saved to ./example-reports/json-report.json');

    // Save HTML report
    await reportGenerator.saveReport(report, 'html', './example-reports/html-report.html');
    console.log('✓ HTML report saved to ./example-reports/html-report.html');

    console.log('\nAll reports generated successfully!');
    console.log(`Overall compatibility score: ${report.overallScore}%`);
    console.log(`Total tests: ${report.summary.totalTests}`);
    console.log(`Passed: ${report.summary.passedTests}`);
    console.log(`Failed: ${report.summary.failedTests}`);

  } catch (error) {
    console.error('Error saving reports:', error);
  }
}

/**
 * Example: Generate report with custom output directory
 */
async function generateReportWithCustomPath() {
  const reportGenerator = createReportGenerator();

  // Simple test result for demonstration
  const testResults: TestResults[] = [
    {
      scenario: {
        name: 'simple-test',
        description: 'Simple test for demonstration',
        category: 'basic',
        collectionDefinition: {
          name: 'demo',
          type: 'base',
          fields: [{ name: 'title', type: 'text', required: true }],
        },
        expectedFeatures: ['text_field'],
        minimumScore: 80,
      },
      executionTime: 1000,
      passed: true,
    },
  ];

  const report = await reportGenerator.generateReport(testResults);

  // Save with custom path
  const customPath = './custom-reports/demo-report.json';
  await reportGenerator.saveReport(report, 'json', customPath);
  console.log(`Custom report saved to: ${customPath}`);
}

/**
 * Example: Generate JSON report for programmatic use
 */
async function generateJSONForAPI() {
  const reportGenerator = createReportGenerator();

  const testResults: TestResults[] = [
    {
      scenario: {
        name: 'api-test',
        description: 'Test for API consumption',
        category: 'basic',
        collectionDefinition: {
          name: 'api_data',
          type: 'base',
          fields: [{ name: 'data', type: 'json', required: true }],
        },
        expectedFeatures: ['json_field'],
        minimumScore: 85,
      },
      executionTime: 1200,
      passed: true,
    },
  ];

  const report = await reportGenerator.generateReport(testResults);
  const jsonReport = reportGenerator.generateJSONReport(report);

  // Parse and use the JSON data
  const reportData = JSON.parse(jsonReport);
  console.log('Report data for API:', {
    timestamp: reportData.timestamp,
    overallScore: reportData.overallScore,
    totalTests: reportData.summary.totalTests,
    passedTests: reportData.summary.passedTests,
  });

  return reportData;
}

// Export example functions for use in other files
export {
  generateExampleReports,
  generateReportWithCustomPath,
  generateJSONForAPI,
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running ReportGenerator examples...\n');
  
  generateExampleReports()
    .then(() => console.log('\n✓ Example reports generated successfully'))
    .catch(error => console.error('✗ Error generating examples:', error));
}