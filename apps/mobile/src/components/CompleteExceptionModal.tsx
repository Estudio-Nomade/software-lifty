import type React from 'react';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  COMPLETE_EXCEPTION_NOTE_MAX,
  COMPLETE_EXCEPTION_REASONS,
  COMPLETE_OK_RADIUS_M,
  type CompleteExceptionReason,
  completeExceptionReasonLabel,
} from '../lib/completeException';
import { theme } from '../theme';
import { Button } from './Button';
import { Input } from './Input';
import { Text } from './ui/Text';

export type CompleteExceptionModalProps = {
  visible: boolean;
  distanceMeters: number | null;
  noteRequired: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: CompleteExceptionReason, note?: string) => void;
};

export const CompleteExceptionModal: React.FC<CompleteExceptionModalProps> = ({
  visible,
  distanceMeters,
  noteRequired,
  submitting,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState<CompleteExceptionReason | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) {
      setReason(null);
      setNote('');
      return;
    }
    if (noteRequired) {
      setReason('other');
    }
  }, [visible, noteRequired]);

  const trimmedNote = note.trim();
  const canSubmit = reason != null && (reason !== 'other' || trimmedNote.length > 0) && !submitting;

  const distanceLine =
    distanceMeters != null
      ? `Estás a ${Math.round(distanceMeters)} m del pin (más de ${COMPLETE_OK_RADIUS_M} m).`
      : `Estás a más de ${COMPLETE_OK_RADIUS_M} m del pin.`;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.title}>Estás lejos del pin</Text>
            <Text style={styles.body}>
              {distanceLine} Para finalizar el viaje tenés que indicar un motivo.
            </Text>

            <View style={styles.chips}>
              {COMPLETE_EXCEPTION_REASONS.map((code) => {
                const selected = reason === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => {
                      if (submitting) return;
                      setReason(code);
                      if (code !== 'other') setNote('');
                    }}
                    disabled={submitting}
                    style={[styles.chip, selected ? styles.chipSelected : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={completeExceptionReasonLabel(code)}
                  >
                    <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                      {completeExceptionReasonLabel(code)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {reason === 'other' ? (
              <Input
                label="Contanos qué pasó"
                placeholder="Motivo (obligatorio)"
                value={note}
                onChangeText={(text) => setNote(text.slice(0, COMPLETE_EXCEPTION_NOTE_MAX))}
                maxLength={COMPLETE_EXCEPTION_NOTE_MAX}
                multiline
                editable={!submitting}
                error={
                  noteRequired && trimmedNote.length === 0
                    ? 'La nota es obligatoria para “Otro”'
                    : undefined
                }
                containerStyle={styles.note}
              />
            ) : null}
          </ScrollView>

          <Button
            title="FINALIZAR CON JUSTIFICACIÓN"
            onPress={() => {
              if (!canSubmit || reason == null) return;
              onSubmit(reason, reason === 'other' ? trimmedNote : undefined);
            }}
            disabled={!canSubmit}
            loading={submitting}
            style={styles.primary}
          />
          <Button
            title="CERRAR"
            variant="secondary"
            onPress={onClose}
            disabled={submitting}
            style={styles.secondary}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 42, 68, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  scrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 22,
  },
  chips: {
    gap: theme.spacing.sm,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.lightGray,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0, 194, 179, 0.12)',
  },
  chipText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  chipTextSelected: {
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
  },
  note: {
    marginTop: theme.spacing.xs,
  },
  primary: {
    width: '100%',
  },
  secondary: {
    width: '100%',
  },
});
