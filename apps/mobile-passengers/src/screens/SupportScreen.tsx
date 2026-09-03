import { Ionicons } from '@expo/vector-icons';
import {
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  SUPPORT_EMAIL,
  buildSupportMailtoUrl,
  buildSupportWhatsAppUrl,
} from '../lib/supportContact';
import { theme } from '../theme';

const FAQ: { question: string; answer: string }[] = [
  {
    question: '¿Me suspendieron por cancelaciones?',
    answer:
      'Si cancelás muchos viajes en poco tiempo, la cuenta puede suspenderse temporalmente (unas 72 horas) o pasar a revisión. Cuando termine la suspensión vas a poder pedir de nuevo. Si creés que es un error, escribinos por WhatsApp.',
  },
  {
    question: '¿Cómo cancelo un viaje?',
    answer:
      'Desde la pantalla del viaje en curso tocá "Cancelar". Si cancelás después de los 5 minutos de espera se aplica un cargo de cancelación.',
  },
  {
    question: '¿Cómo pago en efectivo?',
    answer:
      'Elegí "Efectivo" como método de pago en tu perfil y aboná directamente al conductor al finalizar el viaje.',
  },
  {
    question: '¿Cómo cambio los datos de mi cuenta?',
    answer: 'Andá a Perfil → Editar perfil para modificar tu nombre y teléfono.',
  },
  {
    question: '¿Qué hago ante una emergencia?',
    answer:
      'Durante un viaje podés usar el botón SOS. Esta función contacta a nuestro equipo de soporte y a tus contactos de emergencia.',
  },
];

export function SupportScreen() {
  const { goBack } = useAppNavigation();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Soporte</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Contacto</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.action}
            onPress={() => Linking.openURL(buildSupportMailtoUrl())}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="mail-outline" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Enviar un email</Text>
              <Text style={styles.actionSub}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mediumGray} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            onPress={() => Linking.openURL(buildSupportWhatsAppUrl())}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="logo-whatsapp" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>WhatsApp</Text>
              <Text style={styles.actionSub}>Contacto de desarrollo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mediumGray} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Preguntas frecuentes</Text>
        <View style={styles.faqList}>
          {FAQ.map((item) => (
            <View key={item.question} style={styles.faqCard}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
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
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actions: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionInfo: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  actionSub: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  faqList: {
    gap: theme.spacing.sm,
  },
  faqCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  faqQuestion: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  faqAnswer: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
});
