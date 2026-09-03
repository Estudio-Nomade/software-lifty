import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Linking, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  SUPPORT_EMAIL,
  buildSupportMailtoUrl,
  buildSupportWhatsAppUrl,
} from '../lib/supportContact';
import { theme } from '../theme';

const FAQ: { question: string; answer: string }[] = [
  {
    question: '¿Me bloquearon por cancelaciones?',
    answer:
      'Si tu tasa de cancelación llega al 95% o más (cancelaciones tuyas en camino sobre viajes que cuentan), dejás de recibir ofertas hasta que soporte revise tu cuenta. Con 70% o más te mandamos un aviso. Si creés que es un error, escribinos por WhatsApp.',
  },
  {
    question: '¿Qué es la tasa de cancelación?',
    answer:
      'Mide cuántas veces cancelás vos en camino versus los viajes que completás. Solo cuentan tus cancelaciones en camino; no baja si el pasajero cancela o no se presenta.',
  },
  {
    question: '¿Mis documentos no se aprueban?',
    answer:
      'Subí fotos nítidas desde Perfil → Documentos. Mientras haya documentos pendientes de revisión no podés conectarte. Si llevan mucho tiempo, contactanos.',
  },
  {
    question: '¿Cómo cobro y veo mis pagos?',
    answer:
      'Configurá tu método de cobro en Perfil → Cobros. Los $600 por no-show o cancelación tarde del pasajero aparecen como “Se te debe” en Cancelaciones hasta que Lifty los transfiera.',
  },
  {
    question: '¿Cómo contactar a soporte?',
    answer:
      'Usá el email o WhatsApp de esta pantalla. Contanos qué pasó, en qué pantalla estabas y si viste algún error.',
  },
];

export const SupportScreen: React.FC = () => {
  const navigation = useAppNavigation();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Soporte" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Contacto</Text>
        <Card style={styles.actionsCard} padding={0}>
          <TouchableOpacity
            style={styles.action}
            onPress={() => Linking.openURL(buildSupportMailtoUrl())}
            accessibilityRole="button"
            accessibilityLabel="Enviar un email a soporte"
          >
            <View style={styles.actionIcon}>
              <Ionicons name="mail-outline" size={22} color={theme.colors.turquoise} />
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
            accessibilityRole="button"
            accessibilityLabel="Contactar soporte por WhatsApp"
          >
            <View style={styles.actionIcon}>
              <Ionicons name="logo-whatsapp" size={22} color={theme.colors.turquoise} />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>WhatsApp</Text>
              <Text style={styles.actionSub}>Contacto de desarrollo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mediumGray} />
          </TouchableOpacity>
        </Card>

        <Text style={styles.sectionTitle}>Preguntas frecuentes</Text>
        <View style={styles.faqList}>
          {FAQ.map((item) => (
            <Card key={item.question} style={styles.faqCard}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.dimensions.tabBarHeight + theme.spacing['2xl'],
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionsCard: {
    width: '100%',
    overflow: 'hidden',
    gap: 0,
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
    backgroundColor: theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionInfo: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  actionSub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  faqList: {
    gap: theme.spacing.sm,
  },
  faqCard: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  faqQuestion: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  faqAnswer: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    lineHeight: 20,
  },
});
