import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { type PaymentMethod, type PaymentMethodType, usePaymentStore } from '../store/paymentStore';
import { theme } from '../theme';

export function PaymentMethodScreen() {
  const { goBack } = useAppNavigation();
  const methods = usePaymentStore((s) => s.methods);
  const addTransfer = usePaymentStore((s) => s.addTransfer);
  const removeTransfer = usePaymentStore((s) => s.removeTransfer);
  const setDefault = usePaymentStore((s) => s.setDefault);

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<PaymentMethodType>('transfer');
  const [alias, setAlias] = useState('');
  const [cbu, setCbu] = useState('');
  const [titular, setTitular] = useState('');

  const isCbuValid = cbu.replace(/\D/g, '').length === 22;
  const canAddTransfer = formType === 'transfer' && isCbuValid && alias.trim().length > 0;

  const handleAdd = () => {
    if (formType === 'cash') {
      setDefault('cash');
      resetForm();
      return;
    }
    if (!canAddTransfer) return;
    addTransfer({ alias: alias.trim(), cbu, titular: titular.trim() });
    resetForm();
  };

  const resetForm = () => {
    setShowForm(false);
    setFormType('transfer');
    setAlias('');
    setCbu('');
    setTitular('');
  };

  const renderMethod = (method: PaymentMethod) => (
    <View key={method.id} style={styles.methodCard}>
      <View style={styles.methodIcon}>
        <Ionicons
          name={method.type === 'cash' ? 'cash-outline' : 'swap-horizontal-outline'}
          size={22}
          color={theme.colors.primary}
        />
      </View>
      <View style={styles.methodInfo}>
        <Text style={styles.methodLabel}>{method.label}</Text>
        {method.type === 'transfer' ? (
          <Text style={styles.methodSub}>
            {method.cbu}
            {method.titular ? ` · ${method.titular}` : ''}
          </Text>
        ) : (
          <Text style={styles.methodSub}>Siempre disponible</Text>
        )}
      </View>
      {method.isDefault ? (
        <View style={styles.defaultBadge}>
          <Text style={styles.defaultBadgeText}>Default</Text>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setDefault(method.id)}>
          <Text style={styles.setDefaultText}>Usar</Text>
        </TouchableOpacity>
      )}
      {method.type === 'transfer' ? (
        <TouchableOpacity
          onPress={() => removeTransfer(method.id)}
          style={styles.deleteButton}
          accessibilityLabel={`Eliminar ${method.label}`}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.dangerRed} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Métodos de pago</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {methods.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={48} color={theme.colors.mediumGray} />
            <Text style={styles.emptyTitle}>Sin métodos de pago</Text>
            <Text style={styles.emptySub}>Agrega un método de pago</Text>
          </View>
        ) : (
          <View style={styles.list}>{methods.map(renderMethod)}</View>
        )}

        {!showForm ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.addText}>Agregar método de pago</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.form}>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeOption, formType === 'cash' && styles.typeOptionActive]}
                onPress={() => setFormType('cash')}
              >
                <Ionicons
                  name="cash-outline"
                  size={18}
                  color={formType === 'cash' ? theme.colors.white : theme.colors.deepBlue}
                />
                <Text
                  style={[
                    styles.typeOptionText,
                    formType === 'cash' && styles.typeOptionTextActive,
                  ]}
                >
                  Efectivo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeOption, formType === 'transfer' && styles.typeOptionActive]}
                onPress={() => setFormType('transfer')}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={18}
                  color={formType === 'transfer' ? theme.colors.white : theme.colors.deepBlue}
                />
                <Text
                  style={[
                    styles.typeOptionText,
                    formType === 'transfer' && styles.typeOptionTextActive,
                  ]}
                >
                  Transferencia
                </Text>
              </TouchableOpacity>
            </View>

            {formType === 'cash' ? (
              <Text style={styles.cashNote}>
                El efectivo siempre está disponible. Podés marcarlo como método por defecto.
              </Text>
            ) : (
              <>
                <Input placeholder="Alias" value={alias} onChangeText={setAlias} />
                <Input
                  placeholder="CBU / CVU"
                  value={cbu}
                  onChangeText={(text) => setCbu(text.replace(/\D/g, '').slice(0, 22))}
                  keyboardType="numeric"
                  error={
                    cbu.length > 0 && !isCbuValid
                      ? 'El CBU/CVU debe tener exactamente 22 dígitos'
                      : undefined
                  }
                />
                <Input placeholder="Titular" value={titular} onChangeText={setTitular} />
              </>
            )}

            <View style={styles.formButtons}>
              <Button variant="secondary" onPress={resetForm} style={styles.formButton}>
                Cancelar
              </Button>
              <Button
                onPress={handleAdd}
                disabled={formType === 'transfer' && !canAddTransfer}
                style={styles.formButton}
              >
                {formType === 'cash' ? 'Usar efectivo' : 'Agregar'}
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.sm,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  emptySub: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodInfo: {
    flex: 1,
    gap: 2,
  },
  methodLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  methodSub: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  defaultBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.white,
  },
  setDefaultText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
  },
  form: {
    gap: theme.spacing.md,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    backgroundColor: theme.colors.white,
  },
  typeOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typeOptionText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  typeOptionTextActive: {
    color: theme.colors.white,
  },
  cashNote: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  formButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  formButton: {
    flex: 1,
  },
});
