import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { PaymentMethod } from '../api/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const PaymentMethodScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const queryClient = useQueryClient();

  const [alias, setAlias] = useState('');
  const [cvu, setCvu] = useState('');
  const [bank, setBank] = useState('');
  const [showForm, setShowForm] = useState(false);

  const {
    data: methods,
    isLoading,
    error,
    refetch,
  } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/payment-methods');
      return response.data.data ?? response.data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: {
      method_type: string;
      account_number: string;
      titular_name: string;
      wallet?: string;
    }) => {
      await apiClient.post('/drivers/me/payment-methods', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      setAlias('');
      setCvu('');
      setBank('');
      setShowForm(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Error al agregar metodo de pago';
      Alert.alert('Error', msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/drivers/me/payment-methods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Error al eliminar metodo de pago';
      Alert.alert('Error', msg);
    },
  });

  const handleDelete = (method: PaymentMethod) => {
    Alert.alert('Eliminar metodo de pago', `Eliminar CVU ${method.account_number}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(method.id),
      },
    ]);
  };

  const isCvuValid = cvu.replace(/\D/g, '').length === 22;

  const handleAdd = () => {
    if (!isCvuValid || !alias.trim()) return;
    const body: {
      method_type: string;
      account_number: string;
      titular_name: string;
      wallet?: string;
    } = {
      method_type: 'cvu',
      account_number: cvu.replace(/\D/g, ''),
      titular_name: alias.trim(),
    };
    if (bank.trim()) body.wallet = bank.trim();
    addMutation.mutate(body);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Metodo de cobro" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Tus metodos de pago</Text>

        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <Card style={styles.errorCard} padding={theme.spacing.lg}>
            <Text style={styles.errorText}>No se pudo cargar</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        ) : methods && methods.length > 0 ? (
          methods.map((method) => (
            <View key={method.id} style={styles.methodCard}>
              <View style={styles.methodInfo}>
                <Text style={styles.methodAlias}>{method.titular_name ?? 'CVU'}</Text>
                <Text style={styles.methodCvu}>{method.account_number}</Text>
                {method.wallet ? <Text style={styles.methodBank}>{method.wallet}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => handleDelete(method)} style={styles.deleteButton}>
                <Text style={styles.deleteIcon}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Card style={styles.emptyCard} padding={theme.spacing.lg}>
            <Text style={styles.emptyText}>Agrega un CVU para recibir transferencias</Text>
          </Card>
        )}

        {!showForm ? (
          <Button
            title="AGREGAR METODO DE PAGO"
            onPress={() => setShowForm(true)}
            style={styles.addButton}
          />
        ) : (
          <View style={styles.formSection}>
            <Input
              label="Alias"
              placeholder="Ej: Mi Cuenta"
              value={alias}
              onChangeText={setAlias}
            />
            <Input
              label="CVU"
              placeholder="0000000000000000000000"
              value={cvu}
              onChangeText={(text) => setCvu(text.replace(/\D/g, '').slice(0, 22))}
              keyboardType="numeric"
              maxLength={22}
              error={
                cvu.length > 0 && cvu.replace(/\D/g, '').length !== 22
                  ? 'El CVU debe tener exactamente 22 digitos'
                  : undefined
              }
            />
            <Input
              label="Banco (opcional)"
              placeholder="Ej: Banco Provincia"
              value={bank}
              onChangeText={setBank}
            />
            <View style={styles.formButtons}>
              <Button
                title="Cancelar"
                variant="secondary"
                onPress={() => {
                  setShowForm(false);
                  setAlias('');
                  setCvu('');
                  setBank('');
                }}
                style={styles.cancelButton}
              />
              <Button
                title="Agregar"
                onPress={handleAdd}
                disabled={!isCvuValid || !alias.trim()}
                loading={addMutation.isPending}
                style={styles.submitButton}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  content: {
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
    width: 343,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  methodCard: {
    width: 343,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  methodInfo: {
    flex: 1,
    gap: 4,
  },
  methodAlias: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  methodCvu: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  methodBank: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
    marginTop: 2,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    color: theme.colors.dangerRed,
    fontSize: 14,
    fontWeight: theme.fontWeight.bold,
  },
  emptyCard: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  errorCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  addButton: {
    width: 343,
    marginTop: theme.spacing.md,
  },
  formSection: {
    width: 343,
    gap: theme.spacing.md,
  },
  formButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  cancelButton: {
    flex: 1,
    width: undefined,
  },
  submitButton: {
    flex: 1,
    width: undefined,
  },
});
