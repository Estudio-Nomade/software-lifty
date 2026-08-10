import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const TERMS_TEXT = [
  'Lifty es una plataforma de transporte que conecta pasajeros con conductores verificados. Al usar la aplicación, aceptás los siguientes términos y condiciones.',
  '1. Registro y cuenta',
  'Para usar Lifty necesitás registrarte con un número de celular válido. Sos responsable de mantener la confidencialidad de tu cuenta y de todas las actividades que ocurran bajo tu usuario.',
  '2. Uso del servicio',
  'Lifty te permite solicitar viajes puntuales dentro de las zonas de cobertura. Nos reservamos el derecho de suspender o cancelar tu cuenta si hacemos un uso indebido del servicio.',
  '3. Pagos yTarifas',
  'Las tarifas se calculan según la distancia, el tiempo y la demanda. Aceptás el cargo correspondiente al método de pago registrado al finalizar cada viaje.',
  '4. Cancelaciones',
  'Si cancelás un viaje después de los 5 minutos de espera, se aplica un cargo de cancelación. El monto exacto se informa antes de confirmar.',
  '5. Conducta',
  'Lifty promueve el respeto y la convivencia. Conductas agresivas, discriminatorias o de acoso pueden resultar en la suspensión permanente de la cuenta.',
  '6. Seguridad',
  'En caso de emergencia durante un viaje, podés usar el botón SOS dentro de la aplicación. Esta función contacta a nuestro equipo de soporte y a tus contactos de emergencia.',
  '7. Privacidad',
  'Tus datos personales se tratan según nuestra Política de Privacidad. Compartimos información con el conductor solo lo necesario para completar el viaje.',
  '8. Cambios',
  'Nos reservamos el derecho de modificar estos términos. Los cambios se notifican dentro de la aplicación antes de su entrada en vigencia.',
];

export function TermsScreen() {
  const { goBack } = useAppNavigation();
  const [accepted, setAccepted] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={goBack}>
          ←
        </Text>
        <Text style={styles.title}>Términos y condiciones</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Card padding="lg">
          {TERMS_TEXT.map((paragraph, i) => (
            <Text
              key={i}
              style={[
                styles.paragraph,
                i === 0 && styles.paragraphIntro,
                isHeading(paragraph) && styles.paragraphHeading,
              ]}
            >
              {paragraph}
            </Text>
          ))}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant={accepted ? 'secondary' : 'primary'}
          onPress={() => {
            setAccepted(true);
            goBack();
          }}
        >
          {accepted ? 'Términos aceptados' : 'Aceptar'}
        </Button>
      </View>
    </View>
  );
}

function isHeading(text: string): boolean {
  return /^\d+\.\s/.test(text);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.white,
    gap: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  back: {
    fontSize: 24,
    color: theme.colors.primary,
    fontWeight: '700',
    padding: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
  },
  paragraph: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  paragraphIntro: {
    fontFamily: theme.fontFamily.medium,
    marginBottom: theme.spacing.md,
  },
  paragraphHeading: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semibold,
    marginTop: theme.spacing.sm,
  },
  footer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
});
