import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { authAPI } from '@/services/api';
import { Eye, EyeOff, Lock, Mail, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import '../styles/login.css';

// Particle component for background effect
const Particle = ({ index }: { index: number }) => {
  const style = {
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 5}s`,
    animationDuration: `${5 + Math.random() * 10}s`,
  };
  
  return (
    <div
      className="particle absolute w-1 h-1 bg-primary/20 rounded-full"
      style={style}
    />
  );
};

const Login: React.FC = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login: authLogin } = useAuth();

  // Auto-focus email field on mount
  useEffect(() => {
    emailInputRef.current?.focus();
    
    // Check for remembered credentials
    const rememberedEmail = localStorage.getItem('remembered_email');
    if (rememberedEmail) {
      setForm(prev => ({ ...prev, email: rememberedEmail }));
      setRememberMe(true);
    }
  }, []);

  // Email validation
  const validateEmail = (email: string) => {
    if (!email) {
      setEmailValid(null);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setEmailValid(emailRegex.test(email));
  };

  // Password strength calculation
  const calculatePasswordStrength = (password: string) => {
    if (!password) {
      setPasswordStrength(0);
      return;
    }
    
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength += 15;
    if (/[a-z]/.test(password)) strength += 15;
    if (/[A-Z]/.test(password)) strength += 15;
    if (/[0-9]/.test(password)) strength += 15;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 15;
    
    setPasswordStrength(Math.min(strength, 100));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    
    // Real-time validation
    if (name === 'email') {
      validateEmail(value);
    } else if (name === 'password') {
      calculatePasswordStrength(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate before submit
    if (!emailValid) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const response = await authAPI.login({ email: form.email, password: form.password });
      const { user, token } = response.data;

      if (user && token) {
        // Save auth data
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user_data', JSON.stringify(user));
        
        // Handle remember me
        if (rememberMe) {
          localStorage.setItem('remembered_email', form.email);
        } else {
          localStorage.removeItem('remembered_email');
        }

        // Update auth context
        authLogin(user, token);

        toast({
          title: "✅ Welcome Back!",
          description: `Logged in as ${user.name || user.email}`,
          variant: "default",
        });

        // Redirect to dashboard
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 500);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: unknown) {
      console.error('Login error:', error);
      let message = 'Login failed. Please try again.';
      let title = "Authentication Failed";
      
      if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object') {
        const response = error.response as any;
        
        if (response.status === 401) {
          title = "🔒 Invalid Credentials";
          message = "The email or password you entered is incorrect.";
        } else if (response.status === 429) {
          title = "⏱️ Too Many Attempts";
          message = "Please wait a moment before trying again.";
        } else if (response.status === 403) {
          title = "🚫 Account Locked";
          message = "Your account has been locked. Please contact support.";
        } else if ('data' in response && response.data && typeof response.data === 'object' && 'message' in response.data) {
          message = (response.data as { message?: string }).message || message;
        }
      }
      
      toast({
        title,
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get password strength color
  const getPasswordStrengthColor = () => {
    if (passwordStrength < 25) return 'bg-destructive';
    if (passwordStrength < 50) return 'bg-warning';
    if (passwordStrength < 75) return 'bg-warning';
    return 'bg-success';
  };

  // Get password strength text
  const getPasswordStrengthText = () => {
    if (passwordStrength === 0) return '';
    if (passwordStrength < 25) return 'Weak';
    if (passwordStrength < 50) return 'Fair';
    if (passwordStrength < 75) return 'Good';
    return 'Strong';
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/5 animate-gradient-shift" />
      
      {/* Particle effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <Particle key={i} index={i} />
        ))}
      </div>

      {/* Logo and Title */}
      <div className="text-center mb-8 z-10 animate-fade-in-up">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <img
              src="/logo.png"
              alt="AutoVolt Logo"
              className="h-16 w-auto relative z-10 drop-shadow-2xl"
            />
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold gradient-text-primary mb-2">
          AutoVolt
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground">Smart Automation System</p>
      </div>

      {/* Login Card with Glassmorphism */}
      <Card className="w-full max-w-md glass border-border shadow-2xl shadow-primary/10 z-10 animate-fade-in-up animation-delay-200">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-foreground">Welcome back</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Email
              </Label>
              <div className="relative">
                <Input
                  ref={emailInputRef}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  required
                  className={cn(
                    "bg-input border-border text-foreground placeholder:text-muted-foreground",
                    "focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300",
                    focusedField === 'email' && "shadow-lg shadow-primary/20 scale-[1.02]",
                    emailValid === true && "border-success/50",
                    emailValid === false && "border-destructive/50"
                  )}
                />
                {/* Email validation indicator */}
                {form.email && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {emailValid === true && (
                      <CheckCircle2 className="h-4 w-4 text-success animate-scale-in" />
                    )}
                    {emailValid === false && (
                      <XCircle className="h-4 w-4 text-destructive animate-shake" />
                    )}
                  </div>
                )}
              </div>
              {emailValid === false && (
                <p className="text-xs text-destructive flex items-center gap-1 animate-fade-in">
                  <AlertTriangle className="h-3 w-3" />
                  Please enter a valid email address
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  required
                  className={cn(
                    "bg-input border-border text-foreground placeholder:text-muted-foreground pr-10",
                    "focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300",
                    focusedField === 'password' && "shadow-lg shadow-primary/20 scale-[1.02]"
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              {/* Password strength meter */}
              {form.password && (
                <div className="space-y-1 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Password strength:</span>
                    <span className={cn(
                      "font-medium",
                      passwordStrength < 25 && "text-destructive",
                      passwordStrength >= 25 && passwordStrength < 50 && "text-warning",
                      passwordStrength >= 50 && passwordStrength < 75 && "text-warning",
                      passwordStrength >= 75 && "text-success"
                    )}>
                      {getPasswordStrengthText()}
                    </span>
                  </div>
                  <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-300 rounded-full",
                        getPasswordStrengthColor()
                      )}
                      style={{ width: `${passwordStrength}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                >
                  Remember me
                </label>
              </div>
              <Button
                variant="link"
                className="text-sm text-primary hover:text-primary/80 p-0 h-auto"
                onClick={() => navigate('/forgot-password')}
                type="button"
              >
                Forgot password?
              </Button>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              disabled={loading || emailValid === false} 
              className={cn(
                "w-full btn-primary",
                "font-semibold shadow-lg shadow-primary/30 transition-all duration-300",
                "hover:shadow-xl hover:shadow-primary/50 hover:scale-[1.02]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>

            {/* Registration Link */}
            <div className="text-center pt-2">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto font-medium text-primary hover:text-primary/80"
                  onClick={() => navigate('/register')}
                  type="button"
                >
                  Register here
                </Button>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-muted-foreground z-10 animate-fade-in animation-delay-400">
        <p>© 2025 AutoVolt. Secure login powered by advanced encryption.</p>
      </div>
    </div>
  );
};

export default Login;
