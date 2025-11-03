
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

import { User } from '@/types';
interface LoginPageProps {
  onLogin: (user: User, token: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.login({ email, password });
      const { user, token } = response.data;

      localStorage.setItem('auth_token', token);
      localStorage.setItem('user_data', JSON.stringify(user));

      onLogin(user, token);

      toast({
        title: "Login Successful",
        description: `Welcome back, ${user.name}!`
      });
    } catch (error: unknown) {
      let status: number | undefined;
      let code: string | undefined;
      let message = 'Login failed';
      if (error && typeof error === 'object') {
        if ('response' in error && error.response && typeof error.response === 'object') {
          const resp = error.response as { status?: number; data?: { error?: string; message?: string } };
          status = resp.status;
          code = resp.data?.error;
          message = resp.data?.message || message;
        } else if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
          message = (error as { message: string }).message;
        }
      }
      if (status === 503 || code === 'DB_NOT_CONNECTED') {
        setError('Server is starting up (database unavailable). Please try again in a few seconds.');
      } else {
        setError(message);
      }
      toast({
        title: "Login Failed",
  description: status === 503 || code === 'DB_NOT_CONNECTED' ? 'Backend database is not ready yet. Try again shortly.' : message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="AutoVolt Logo" className="h-12 w-auto" />
          </div>
          <CardTitle className="text-2xl font-bold">Classroom Automation</CardTitle>
          <p className="text-muted-foreground">Sign in to access the control panel</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@autovolt.com"
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Default Admin Account:</p>
            <p className="text-xs text-muted-foreground">
              Email: admin@college.edu<br />
              Password: admin123456
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
