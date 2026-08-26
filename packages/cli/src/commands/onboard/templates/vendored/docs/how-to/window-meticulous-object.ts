import {
  HANDLE_FILE_UPLOADS_URL,
  RECORD_CUSTOM_VALUES_URL,
  TYPESCRIPT_TYPES_URL,
  USE_CUSTOM_EVENT_API_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

export const document = `---
{
  "title": "window.Meticulous API Reference"
}
---

# {% $frontmatter.title %}

Complete reference for the \`window.Meticulous\` JavaScript API available in your application.

---

## Overview

The \`window.Meticulous\` object is exposed by the Meticulous recorder snippet and provides methods for:
- Detecting test mode
- Recording custom data
- Controlling replay timing
- Handling custom events

**Availability**: Only when Meticulous recorder is loaded.

**TypeScript types**: See [TypeScript Types](${TYPESCRIPT_TYPES_URL}) for full type definitions.

---

## API Reference

### isRunningAsTest

**Type**: \`boolean | undefined\`

**Description**: Indicates whether the app is running as a Meticulous test.

**Values**:
- \`true\`: Running in test/replay mode
- \`false\` or \`undefined\`: Running normally (production/development)

**Example**:

\`\`\`typescript
if (window.Meticulous?.isRunningAsTest) {
  // Skip validation, use test data, etc.
  console.log('Running as Meticulous test');
} else {
  // Normal application logic
  console.log('Running normally');
}
\`\`\`

**Common use cases**:
- Skip form validation
- Bypass authentication
- Use deterministic values (timestamps, IDs)
- Disable analytics/tracking
- Skip animations

---

### recordCustomValues()

**Signature**: \`recordCustomValues(values: Record<string, any>): void\`

**Description**: Store custom data during recording to be retrieved during replay.

**Parameters**:
- \`values\`: Object with key-value pairs to store

**Size limits**:
- **Development**: 20MB total (set \`data-is-production-environment="false"\`)
- **Production**: 1MB total

**When to use**:
- Store file upload contents
- Record feature flag values
- Save user context
- Preserve random/dynamic values

**Example**:

\`\`\`typescript
// During recording
const handleFileUpload = (file: File) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const fileData = e.target?.result as string;

    // Store for replay
    if (window.Meticulous?.recordCustomValues) {
      window.Meticulous.recordCustomValues({
        uploadedFile: fileData,
        fileName: file.name,
        fileType: file.type,
      });
    }

    processFile(fileData);
  };
  reader.readAsDataURL(file);
};
\`\`\`

**Multiple calls**: Values are merged, not overwritten. Later calls add/update keys.

\`\`\`typescript
// First call
window.Meticulous.recordCustomValues({ key1: 'value1' });

// Second call - adds key2, keeps key1
window.Meticulous.recordCustomValues({ key2: 'value2' });

// Result: { key1: 'value1', key2: 'value2' }
\`\`\`

---

### getCustomValues()

**Signature**: \`getCustomValues(): Record<string, any> | undefined\`

**Description**: Retrieve custom values stored during recording.

**Returns**: Object with stored values, or \`undefined\` if none.

**When to use**:
- Restore file upload data during replay
- Get feature flag values
- Restore user context

**Example**:

\`\`\`typescript
// During replay
useEffect(() => {
  if (window.Meticulous?.isRunningAsTest) {
    const stored = window.Meticulous.getCustomValues();

    if (stored?.uploadedFile) {
      // Restore file preview
      setPreview(stored.uploadedFile);
    }

    if (stored?.featureFlags) {
      // Apply feature flags
      setFlags(stored.featureFlags);
    }
  }
}, []);
\`\`\`

**Complete pattern**:

\`\`\`typescript
function useStoredValue(key: string) {
  const [value, setValue] = useState(null);

  useEffect(() => {
    if (window.Meticulous?.isRunningAsTest) {
      const stored = window.Meticulous.getCustomValues();
      if (stored?.[key]) {
        setValue(stored[key]);
      }
    }
  }, [key]);

  return value;
}

// Usage
const userContext = useStoredValue('userContext');
\`\`\`

---

### pause()

**Signature**: \`pause(): void\`

**Description**: Pause replay until \`resume()\` is called.

**When to use**:
- Before async operations (data loading, image loading)
- Before third-party script initialization
- When content loads dynamically

**Important**: Always pair with \`resume()\`. Unpaired \`pause()\` will hang the test.

**Example - Data Loading**:

\`\`\`typescript
async function loadCriticalData() {
  window.Meticulous?.pause?.();

  try {
    const data = await fetchDataFromAPI();
    setData(data);
  } finally {
    window.Meticulous?.resume?.();
  }
}
\`\`\`

**Example - Image Loading**:

\`\`\`typescript
function LazyImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && window.Meticulous?.isRunningAsTest) {
      window.Meticulous?.pause?.();
    }
  }, [loaded]);

  const handleLoad = () => {
    setLoaded(true);
    window.Meticulous?.resume?.();
  };

  return <img src={src} onLoad={handleLoad} />;
}
\`\`\`

---

### resume()

**Signature**: \`resume(): void\`

**Description**: Resume replay after \`pause()\`.

**When to use**: After the async operation started with \`pause()\` completes.

**Example - Third-Party Script**:

\`\`\`typescript
function loadGoogleMaps() {
  return new Promise((resolve) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    window.Meticulous?.pause?.();

    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/.../js?key=KEY';
    script.onload = () => {
      window.Meticulous?.resume?.();
      resolve(window.google.maps);
    };
    script.onerror = () => {
      window.Meticulous?.resume?.();
      reject(new Error('Failed to load'));
    };

    document.head.appendChild(script);
  });
}
\`\`\`

---

### recordCustomEvent()

**Signature**: \`recordCustomEvent(event: { type: string; payload?: any }): void\`

**Description**: Record a custom event with optional payload.

**Parameters**:
- \`event.type\`: String identifying the event type
- \`event.payload\`: Optional data to store with event

**When to use**: Advanced scenarios requiring fine-grained replay control.

**Example**:

\`\`\`typescript
// Record event during session
function handlePaymentComplete(transaction: Transaction) {
  if (window.Meticulous?.recordCustomEvent) {
    window.Meticulous.recordCustomEvent({
      type: 'PAYMENT_COMPLETE',
      payload: {
        transactionId: transaction.id,
        amount: transaction.amount,
        timestamp: Date.now(),
      },
    });
  }

  showSuccessMessage();
}
\`\`\`

---

### onReplayCustomEvent()

**Signature**: \`onReplayCustomEvent(handler: (event: CustomEvent) => void): void\`

**Description**: Register handler for custom events during replay.

**Parameters**:
- \`handler\`: Function called when custom event is replayed

**Example**:

\`\`\`typescript
// Setup handler during component mount
useEffect(() => {
  if (window.Meticulous?.onReplayCustomEvent) {
    window.Meticulous.onReplayCustomEvent((event) => {
      if (event.type === 'PAYMENT_COMPLETE') {
        console.log('Replaying payment:', event.payload);
        handlePaymentReplay(event.payload);
      }
    });
  }
}, []);
\`\`\`

---

## Backend Detection

### meticulous-is-test Header

Check for the \`meticulous-is-test\` header in server-side code:

**Value**: \`"1"\` when running as test

**Security**: For secure detection, set a custom secret header in project settings.

### Next.js App Router

\`\`\`typescript
import { headers } from 'next/headers';

export async function isMeticulousTest(): Promise<boolean> {
  const requestHeaders = await headers();
  return requestHeaders.get('meticulous-is-test') === '1';
}

// Usage in Server Component
export default async function Page() {
  const isTest = await isMeticulousTest();

  if (isTest) {
    // Skip auth, use test data, etc.
  }

  return <div>...</div>;
}
\`\`\`

### Next.js Pages Router

\`\`\`typescript
export const getServerSideProps = (context) => {
  const { req } = context;
  const isTest = req.headers['meticulous-is-test'] === '1';

  return {
    props: {
      isRunningAsMeticulousTest: isTest,
    },
  };
};

function Page({ isRunningAsMeticulousTest }) {
  if (isRunningAsMeticulousTest) {
    // Test-specific rendering
  }

  return <div>...</div>;
}
\`\`\`

### Express.js

\`\`\`typescript
app.get('/api/data', (req, res) => {
  const isTest = req.headers['meticulous-is-test'] === '1';

  if (isTest) {
    // Return test data
    res.json({ data: 'test-data' });
  } else {
    // Return real data
    res.json({ data: getRealData() });
  }
});
\`\`\`

---

## Common Patterns

### Pattern 1: Skip Validation

\`\`\`typescript
function submitForm(data: FormData) {
  if (!window.Meticulous?.isRunningAsTest) {
    // Only validate in normal mode
    if (!data.email) {
      throw new Error('Email required');
    }
  }

  // Submit form
  return api.post('/submit', data);
}
\`\`\`

### Pattern 2: Deterministic Values

\`\`\`typescript
function generateId(): string {
  if (window.Meticulous?.isRunningAsTest) {
    return 'test-id-12345';
  }
  return crypto.randomUUID();
}

function getCurrentTimestamp(): string {
  if (window.Meticulous?.isRunningAsTest) {
    return '2024-01-01T00:00:00Z';
  }
  return new Date().toISOString();
}
\`\`\`

### Pattern 3: Disable Third-Party Services

\`\`\`typescript
function initializeServices() {
  if (!window.Meticulous?.isRunningAsTest) {
    initializeAnalytics();
    initializeSentry();
    initializeIntercom();
  }
}
\`\`\`

### Pattern 4: Feature Flags

\`\`\`typescript
function useFeatureFlag(flagName: string): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.Meticulous?.isRunningAsTest) {
      const stored = window.Meticulous.getCustomValues();
      if (stored?.featureFlags?.[flagName] !== undefined) {
        setEnabled(stored.featureFlags[flagName]);
        return;
      }
    }

    // Normal flag fetching
    fetchFlag(flagName).then(setEnabled);
  }, [flagName]);

  return enabled;
}

// Record flags during session
if (window.Meticulous?.recordCustomValues) {
  window.Meticulous.recordCustomValues({
    featureFlags: {
      newCheckout: true,
      experimentalUI: false,
    },
  });
}
\`\`\`

### Pattern 5: Conditional Rendering

\`\`\`typescript
function WelcomeBanner() {
  if (window.Meticulous?.isRunningAsTest) {
    // Don't show banner during tests
    return null;
  }

  return <div>Welcome!</div>;
}
\`\`\`

---

## Integration Patterns

### React Hook

\`\`\`typescript
function useMeticulous() {
  return {
    isTest: window.Meticulous?.isRunningAsTest ?? false,
    recordValues: window.Meticulous?.recordCustomValues,
    getValues: window.Meticulous?.getCustomValues,
    pause: window.Meticulous?.pause,
    resume: window.Meticulous?.resume,
  };
}

// Usage
function MyComponent() {
  const { isTest, recordValues } = useMeticulous();

  if (isTest) {
    // Test-specific logic
  }
}
\`\`\`

### Context Provider

\`\`\`typescript
const MeticulousContext = createContext({
  isTest: false,
  recordValues: () => {},
  getValues: () => ({}),
});

function MeticulousProvider({ children }) {
  const value = {
    isTest: window.Meticulous?.isRunningAsTest ?? false,
    recordValues: window.Meticulous?.recordCustomValues?.bind(window.Meticulous) ?? (() => {}),
    getValues: window.Meticulous?.getCustomValues?.bind(window.Meticulous) ?? (() => ({})),
  };

  return (
    <MeticulousContext.Provider value={value}>
      {children}
    </MeticulousContext.Provider>
  );
}

// Usage
const { isTest } = useContext(MeticulousContext);
\`\`\`

---

## Best Practices

### 1. Always Use Optional Chaining

\`\`\`typescript
// Good
window.Meticulous?.isRunningAsTest

// Bad - throws error if Meticulous not loaded
window.Meticulous.isRunningAsTest
\`\`\`

### 2. Pair pause() with resume()

\`\`\`typescript
// Good - always resume
async function load() {
  window.Meticulous?.pause?.();
  try {
    await fetchData();
  } finally {
    window.Meticulous?.resume?.();
  }
}

// Bad - might not resume
async function load() {
  window.Meticulous?.pause?.();
  await fetchData();
  window.Meticulous?.resume?.(); // Skipped if fetchData throws
}
\`\`\`

### 3. Check isRunningAsTest Before Using Other Methods

\`\`\`typescript
// Good
if (window.Meticulous?.isRunningAsTest) {
  const values = window.Meticulous.getCustomValues();
}

// Also good
const values = window.Meticulous?.getCustomValues?.();
\`\`\`

### 4. Record Early, Retrieve Early

\`\`\`typescript
// Record as soon as data is available
useEffect(() => {
  if (userData && window.Meticulous?.recordCustomValues) {
    window.Meticulous.recordCustomValues({ user: userData });
  }
}, [userData]);

// Retrieve during component initialization
useEffect(() => {
  if (window.Meticulous?.isRunningAsTest) {
    const stored = window.Meticulous.getCustomValues();
    if (stored?.user) {
      setUser(stored.user);
    }
  }
}, []); // Empty deps - run once
\`\`\`

---

## Troubleshooting

### window.Meticulous is undefined

**Cause**: Recorder not loaded

**Solutions**:
- Verify recorder script tag is in HTML
- Check script loads before app code
- Check for CSP blocking

### Custom values not available during replay

**Cause**: Values not recorded or size limit exceeded

**Solutions**:
- Check \`recordCustomValues\` was called during recording
- Verify value size < 1MB (prod) or 20MB (dev)
- Check \`data-is-production-environment\` setting

### Pause/Resume hanging tests

**Cause**: \`resume()\` never called

**Solutions**:
- Use try/finally to ensure \`resume()\` always runs
- Check async callbacks complete
- Add timeout fallback

---

## TypeScript Types

For full TypeScript type definitions:

\`\`\`typescript
interface Meticulous {
  isRunningAsTest?: boolean;
  recordCustomValues?: (values: Record<string, any>) => void;
  getCustomValues?: () => Record<string, any> | undefined;
  pause?: () => void;
  resume?: () => void;
  recordCustomEvent?: (event: { type: string; payload?: any }) => void;
  onReplayCustomEvent?: (handler: (event: any) => void) => void;
}

declare global {
  interface Window {
    Meticulous?: Meticulous;
  }
}
\`\`\`

See [TypeScript Types](${TYPESCRIPT_TYPES_URL}) for importable types.

---

## See Also

- [Record Custom Values](${RECORD_CUSTOM_VALUES_URL}) - Detailed custom values guide
- [Custom Event API](${USE_CUSTOM_EVENT_API_URL}) - Advanced event handling
- [Handle File Uploads](${HANDLE_FILE_UPLOADS_URL}) - File upload patterns
`;
