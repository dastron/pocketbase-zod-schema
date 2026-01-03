# E2E Test Results Tracking

This directory contains the results tracking system for E2E migration validation tests. The system automatically tracks diff percentages between PocketBase native CLI and library-generated migrations, providing a simple way to monitor compatibility over time.

## Results File Structure

The main results file (`test-results.json`) contains:

```json
{
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "totalTests": 8,
  "averageDiffPercentage": 87.25,
  "tests": {
    "scenario-name": {
      "scenarioName": "scenario-name",
      "diffPercentage": 95.2,
      "timestamp": "2024-01-15T10:25:00.000Z",
      "passed": true,
      "details": {
        "nativeFile": "1705312500_created_basic_test.js",
        "libraryFile": "1705312500_created_basic_test.js",
        "differences": ["Field option format difference"],
        "score": 95
      }
    }
  }
}
```

## Key Features

### Automatic Result Recording
- Results are automatically recorded when using the CLI Response Analyzer
- Each test scenario gets a diff percentage score (0-100%)
- Pass/fail status based on configurable threshold (default: 70%)
- Detailed difference tracking for debugging

### Comprehensive Tracking
- **Diff Percentage**: Compatibility score between native and library migrations
- **Pass/Fail Status**: Whether the test meets the minimum threshold
- **Timestamps**: When each test was last executed
- **File References**: Native and library migration file names
- **Differences**: Specific differences found during comparison
- **Metadata**: Total tests, average scores, last update time

### Multiple Export Formats
- **JSON**: Machine-readable format for integration
- **CSV**: Spreadsheet-compatible format for analysis
- **Markdown**: Human-readable reports for documentation

### Trend Analysis
- Compare current results with previous runs
- Identify improved, degraded, new, and unchanged tests
- Track progress over time

## CLI Usage

### View Results Summary
```bash
npx tsx tests/e2e/cli/results-cli.ts summary
```

### List All Results
```bash
npx tsx tests/e2e/cli/results-cli.ts list
```

### Filter Results
```bash
# Show only failed tests
npx tsx tests/e2e/cli/results-cli.ts list --failed

# Show tests with score >= 90%
npx tsx tests/e2e/cli/results-cli.ts list --min-score 90

# Show recent results
npx tsx tests/e2e/cli/results-cli.ts list --since "2024-01-01"
```

### Export Results
```bash
# Export as JSON
npx tsx tests/e2e/cli/results-cli.ts export --format json -o results.json

# Export as CSV
npx tsx tests/e2e/cli/results-cli.ts export --format csv -o results.csv

# Export as Markdown report
npx tsx tests/e2e/cli/results-cli.ts export --format markdown -o report.md
```

### Compare Results
```bash
npx tsx tests/e2e/cli/results-cli.ts compare -p tests/e2e/results/previous-results.json
```

### Get Detailed Info
```bash
npx tsx tests/e2e/cli/results-cli.ts info basic-collection
```

### Manual Updates
```bash
npx tsx tests/e2e/cli/results-cli.ts update basic-collection 95.5 --passed
```

### Clear Results
```bash
npx tsx tests/e2e/cli/results-cli.ts clear --confirm
```

## Programmatic Usage

### Basic Usage
```typescript
import { ResultsTracker, updateTestResult, getResultsSummary } from '../utils/results-tracker.js';

// Quick update using default tracker
updateTestResult('my-scenario', 92.5, true, {
  nativeFile: 'native.js',
  libraryFile: 'library.js',
  differences: ['Minor formatting difference'],
  score: 92
});

// Get summary
const summary = getResultsSummary();
console.log(`Average score: ${summary.averageDiffPercentage}%`);
```

### Custom Tracker
```typescript
import { ResultsTracker } from '../utils/results-tracker.js';

const tracker = new ResultsTracker('custom-results.json');

// Update result
tracker.updateTestResult('scenario-1', 88.5, true);

// Get filtered results
const failedTests = tracker.getFilteredResults({ passed: false });

// Export results
const markdown = tracker.exportResults('markdown');
```

### Integration with CLI Analyzer
```typescript
import { createCLIResponseAnalyzer } from '../components/cli-response-analyzer.js';
import { ResultsTracker } from '../utils/results-tracker.js';

const analyzer = createCLIResponseAnalyzer();
const tracker = new ResultsTracker();

// Set tracker for automatic result recording
analyzer.setResultsTracker(tracker);

// Compare migrations - results automatically recorded
const comparison = await analyzer.compareMigrations(
  nativeMigration, 
  libraryMigration, 
  'my-scenario'  // Scenario name for result tracking
);
```

## Result Interpretation

### Diff Percentage Scores
- **90-100%**: Excellent compatibility, minimal differences
- **80-89%**: Good compatibility, minor differences
- **70-79%**: Acceptable compatibility, some differences
- **60-69%**: Poor compatibility, significant differences
- **0-59%**: Very poor compatibility, major differences

### Common Difference Types
- **Field option format**: Different option structures (minor)
- **Rule formatting**: Whitespace or formatting differences (minor)
- **Index naming**: Different index naming conventions (minor)
- **Field type mismatch**: Different field types (critical)
- **Missing fields**: Fields present in one but not the other (critical)
- **System field handling**: Different auth/system field configurations (major)

### Pass/Fail Thresholds
- **Default threshold**: 70% (configurable)
- **Strict threshold**: 85% (for critical scenarios)
- **Lenient threshold**: 60% (for experimental features)

## Best Practices

### Regular Monitoring
1. **Run tests regularly**: Execute E2E tests on each library change
2. **Track trends**: Compare results over time to identify regressions
3. **Set thresholds**: Define appropriate pass/fail thresholds for different scenarios
4. **Review failures**: Investigate failed tests to identify root causes

### Result Management
1. **Archive results**: Keep historical results for trend analysis
2. **Clean up**: Periodically remove very old results to manage file size
3. **Backup**: Include results files in version control or backup systems
4. **Document changes**: Note significant changes in compatibility scores

### Integration
1. **CI/CD**: Include results checking in continuous integration
2. **Reporting**: Generate regular compatibility reports
3. **Alerts**: Set up alerts for significant score drops
4. **Dashboards**: Create dashboards for visual monitoring

## File Locations

- **Main results**: `tests/e2e/results/test-results.json`
- **Sample results**: `tests/e2e/results/sample-results.json`
- **Archived results**: `tests/e2e/results/archive/`
- **Exported reports**: `tests/e2e/results/reports/`

## Configuration

### Environment Variables
```bash
# Custom results file path
export E2E_RESULTS_PATH="custom-results.json"

# Pass/fail threshold
export E2E_PASS_THRESHOLD="75"

# Auto-export format
export E2E_AUTO_EXPORT="markdown"
```

### Programmatic Configuration
```typescript
const tracker = new ResultsTracker('custom-path.json');

// Custom threshold for pass/fail
const passed = diffPercentage >= 85; // Strict threshold

tracker.updateTestResult(scenarioName, diffPercentage, passed);
```

## Troubleshooting

### Results Not Saving
- Check file permissions in results directory
- Ensure directory exists (created automatically)
- Verify JSON syntax if editing manually

### Missing Results
- Ensure scenario names match exactly
- Check if results were cleared accidentally
- Verify CLI analyzer is configured with scenario names

### Performance Issues
- Large results files (>10MB) may slow operations
- Archive old results periodically
- Use filtering to work with subsets of results

### Integration Issues
- Ensure results tracker is properly initialized
- Check that CLI analyzer has results tracker set
- Verify scenario names are passed to comparison methods