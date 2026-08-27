import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      // Prefer signup OTP (register flow). Fall back to email OTP for older codes.
      const first = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });
      if (!first.error) return first.data;

      const second = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (second.error) throw second.error;
      return second.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useResendCode() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      return { message: 'Codigo reenviado' };
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      return { message: 'Codigo enviado' };
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({
      email,
      code,
      password,
    }: {
      email: string;
      code: string;
      password: string;
    }) => {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (verifyError) throw verifyError;

      if (!data.session) {
        throw new Error('No se pudo verificar la identidad. Intenta de nuevo.');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      return { message: 'Contrasena actualizada' };
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return {
        access_token: data.session?.access_token ?? '',
        user: {
          id: data.user?.id ?? '',
          email: data.user?.email ?? '',
          role: (data.user?.user_metadata?.role as string) ?? 'driver',
        },
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useSignOut() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (token) {
        try {
          await apiClient.post('/auth/logout');
        } catch {
          /* best-effort */
        }
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    },
    onSuccess: () => {},
  });
}
