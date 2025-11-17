# Module 1: Frontend & UI Components

## Overview
The Frontend & UI Components module provides the user interface and user experience for the AutoVolt IoT classroom automation system. Built with modern React technologies, it offers a responsive, real-time dashboard with voice control capabilities and mobile application support.

## Technology Stack

### Core Framework
- **React 18** - Latest React with concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives

### Mobile Development
- **Capacitor** - Cross-platform mobile app framework
- **Android Studio** - Android app development
- **Xcode** - iOS app development (future)

### State Management
- **React Query** - Server state management
- **Context API** - Global application state
- **Custom Hooks** - Reusable stateful logic

### Real-time Communication
- **WebSocket** - Real-time device updates
- **MQTT Client** - IoT device communication
- **Server-Sent Events** - Push notifications

## Architecture

### Component Structure
```
src/
├── components/           # Reusable UI components
│   ├── ui/              # Base UI components (Radix)
│   ├── dashboard/       # Dashboard-specific components
│   ├── devices/         # Device control components
│   ├── voice/           # Voice control interface
│   └── analytics/       # Analytics visualization
├── pages/               # Page components
├── hooks/               # Custom React hooks
├── services/            # API service functions
├── contexts/            # React contexts
├── utils/               # Utility functions
└── types/               # TypeScript type definitions
```

### Key Components

#### Dashboard Components
```typescript
// Main Dashboard Layout
interface DashboardProps {
  user: User;
  devices: Device[];
  onDeviceUpdate: (device: Device) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, devices, onDeviceUpdate }) => {
  return (
    <div className="dashboard-container">
      <Header user={user} />
      <DeviceGrid devices={devices} onUpdate={onDeviceUpdate} />
      <AnalyticsPanel />
      <VoiceControl />
    </div>
  );
};
```

#### Device Control Components
```typescript
// Device Switch Component
interface DeviceSwitchProps {
  device: Device;
  switch: Switch;
  onToggle: (deviceId: string, switchId: string, state: boolean) => void;
}

const DeviceSwitch: React.FC<DeviceSwitchProps> = ({ device, switch: switchData, onToggle }) => {
  const handleToggle = async () => {
    try {
      await onToggle(device._id, switchData._id, !switchData.state);
    } catch (error) {
      console.error('Failed to toggle switch:', error);
    }
  };

  return (
    <div className="device-switch">
      <Switch
        checked={switchData.state}
        onCheckedChange={handleToggle}
        disabled={switchData.manualOverride}
      />
      <span>{switchData.name}</span>
    </div>
  );
};
```

#### Voice Control Interface
```typescript
// Voice Command Processor
interface VoiceCommand {
  command: string;
  confidence: number;
  timestamp: Date;
}

const VoiceControl: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Voice recognition logic
      setIsListening(true);
    } catch (error) {
      console.error('Voice recognition error:', error);
    }
  };

  return (
    <div className="voice-control">
      <button onClick={startListening} disabled={isListening}>
        {isListening ? 'Listening...' : 'Voice Control'}
      </button>
      {lastCommand && (
        <div className="last-command">
          <p>Command: {lastCommand.command}</p>
          <p>Confidence: {lastCommand.confidence}%</p>
        </div>
      )}
    </div>
  );
};
```

## State Management

### React Query Integration
```typescript
// Device data fetching
const useDevices = () => {
  return useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const response = await api.get('/api/devices');
      return response.data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

// Device mutation
const useToggleSwitch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId, switchId, state }: ToggleParams) => {
      const response = await api.post(`/api/devices/${deviceId}/switches/${switchId}/toggle`, {
        state
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};
```

### WebSocket Integration
```typescript
// WebSocket context for real-time updates
const WebSocketContext = createContext<WebSocket | null>(null);

const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'device_state_changed') {
        queryClient.invalidateQueries({ queryKey: ['devices'] });
      }
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [queryClient]);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};
```

## Mobile Application

### Capacitor Configuration
```json
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.autovolt.app',
  appName: 'AutoVolt',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      backgroundColor: '#1a365d'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
```

### Platform-Specific Features
```typescript
// Android-specific permissions
const requestPermissions = async () => {
  const { Permissions } = await import('@capacitor/permissions');

  const microphone = await Permissions.query({
    name: 'microphone'
  });

  if (microphone.state !== 'granted') {
    await Permissions.request({
      name: 'microphone'
    });
  }
};

// iOS-specific features (future)
const configureIOS = async () => {
  const { Device } = await import('@capacitor/device');
  const info = await Device.getInfo();

  if (info.platform === 'ios') {
    // iOS-specific configuration
  }
};
```

## Voice Control Features

### Speech Recognition
```typescript
// Speech recognition hook
const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);
      processVoiceCommand(result);
    };

    recognition.start();
  };

  return { isListening, transcript, startListening };
};
```

### Voice Command Processing
```typescript
// Voice command types
interface VoiceCommand {
  intent: 'device_control' | 'status_query' | 'energy_query' | 'unknown';
  entities: {
    devices: string[];
    actions: string[];
    locations: string[];
  };
  confidence: number;
}

// Command processor
const processVoiceCommand = async (command: string) => {
  try {
    const response = await api.post('/api/voice-assistant/process', {
      command,
      platform: 'web'
    });

    const voiceCommand: VoiceCommand = response.data;

    // Execute command based on intent
    switch (voiceCommand.intent) {
      case 'device_control':
        await executeDeviceControl(voiceCommand);
        break;
      case 'status_query':
        await executeStatusQuery(voiceCommand);
        break;
      default:
        console.log('Unknown command intent');
    }
  } catch (error) {
    console.error('Voice command processing failed:', error);
  }
};
```

## Responsive Design

### Tailwind Configuration
```javascript
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          900: '#1e3a8a'
        }
      },
      screens: {
        'xs': '475px',
        '3xl': '1600px'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('tailwindcss-radix')()
  ]
};
```

### Responsive Components
```typescript
// Responsive device grid
const DeviceGrid: React.FC<{ devices: Device[] }> = ({ devices }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {devices.map(device => (
        <DeviceCard key={device._id} device={device} />
      ))}
    </div>
  );
};
```

## Error Handling & Loading States

### Error Boundaries
```typescript
// Error boundary component
class ErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }

    return this.props.children;
  }
}
```

### Loading States
```typescript
// Loading component with skeleton
const DeviceCardSkeleton: React.FC = () => {
  return (
    <div className="device-card animate-pulse">
      <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-300 rounded w-1/2 mb-4"></div>
      <div className="flex space-x-2">
        <div className="h-8 bg-gray-300 rounded w-16"></div>
        <div className="h-8 bg-gray-300 rounded w-16"></div>
      </div>
    </div>
  );
};
```

## Testing Strategy

### Unit Testing
```typescript
// Component testing with React Testing Library
import { render, screen, fireEvent } from '@testing-library/react';
import { DeviceSwitch } from './DeviceSwitch';

test('toggles device switch', () => {
  const mockOnToggle = jest.fn();
  const device = { _id: '1', name: 'Test Device' };
  const switchData = { _id: '1', name: 'Light', state: false };

  render(
    <DeviceSwitch
      device={device}
      switch={switchData}
      onToggle={mockOnToggle}
    />
  );

  const switchElement = screen.getByRole('switch');
  fireEvent.click(switchElement);

  expect(mockOnToggle).toHaveBeenCalledWith('1', '1', true);
});
```

### Integration Testing
```typescript
// API integration testing
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Dashboard } from './Dashboard';

const server = setupServer(
  rest.get('/api/devices', (req, res, ctx) => {
    return res(ctx.json([
      { _id: '1', name: 'Classroom Light', switches: [] }
    ]));
  })
);

test('loads and displays devices', async () => {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Classroom Light')).toBeInTheDocument();
  });
});
```

## Performance Optimization

### Code Splitting
```typescript
// Lazy loading components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));

const App: React.FC = () => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
};
```

### Memoization
```typescript
// Memoized components
const DeviceCard = React.memo<DeviceCardProps>(({ device, onUpdate }) => {
  return (
    <div className="device-card">
      <h3>{device.name}</h3>
      {/* Device switches */}
    </div>
  );
});

// Memoized callbacks
const handleDeviceUpdate = useCallback((device: Device) => {
  // Update logic
}, []);
```

## Deployment

### Build Configuration
```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
```

### Capacitor Build Process
```bash
# Build web assets
npm run build

# Add platforms
npx cap add android
npx cap add ios

# Copy web assets to native projects
npx cap copy

# Open in native IDEs
npx cap open android
npx cap open ios
```

This comprehensive frontend module provides a modern, responsive, and feature-rich user interface for the AutoVolt IoT classroom automation system, supporting both web and mobile platforms with advanced voice control capabilities.