import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { type PassengerNotification, useNotificationsStore } from '../store/notificationsStore';
import { theme } from '../theme';

export function NotificationsScreen() {
  const { goBack } = useAppNavigation();
  const items = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const renderNotification = (notification: PassengerNotification) => (
    <View key={notification.id} style={styles.notification}>
      <View style={styles.notifIconCircle}>
        <Ionicons name="notifications-outline" size={20} color={theme.colors.deepBlue} />
      </View>
      <View style={styles.notifTexts}>
        <Text style={styles.notifTitle}>{notification.title}</Text>
        <Text style={styles.notifBody}>{notification.body}</Text>
        <Text style={styles.notifDate}>{notification.createdAt}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificaciones</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="notifications-outline" size={32} color={theme.colors.mediumGray} />
            </View>
            <Text style={styles.emptyTitle}>No tenés notificaciones</Text>
            <Text style={styles.emptyBody}>
              Acá vas a ver el estado de tus viajes, promociones y novedades.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>{items.map(renderNotification)}</View>
        )}
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
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.white,
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  emptyBody: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: theme.spacing.sm,
  },
  notification: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  notifIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTexts: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.deepBlue,
  },
  notifBody: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  notifDate: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
