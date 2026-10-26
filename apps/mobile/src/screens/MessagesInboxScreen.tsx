import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTabBarScrollVisibility } from '../hooks/useTabBarScrollVisibility';
import { getTabBarReserve } from '../lib/tabBarLayout';
import { theme } from '../theme';

type AccountMessage = {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

function formatArDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const MessagesInboxScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const { onScroll } = useTabBarScrollVisibility();
  const contentPadBottom = getTabBarReserve(insets.bottom) + theme.spacing['2xl'];
  const params = useLocalSearchParams<{ messageId?: string; reviewReason?: string }>();

  const [items, setItems] = useState<AccountMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.messageId ?? null);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        const res = await apiClient.get('/drivers/me/messages');
        const payload = res.data?.data ?? res.data;
        const list = (payload?.items ?? []) as AccountMessage[];
        setItems(list);
        if (params.messageId) {
          setSelectedId(params.messageId);
          const target = list.find((m) => m.id === params.messageId);
          if (target && !target.read_at) {
            void apiClient.post(`/drivers/me/messages/${params.messageId}/read`).catch(() => {});
            setItems((prev) =>
              prev.map((m) =>
                m.id === params.messageId ? { ...m, read_at: new Date().toISOString() } : m,
              ),
            );
          }
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [params.messageId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selected = useMemo(
    () => items.find((m) => m.id === selectedId) ?? null,
    [items, selectedId],
  );

  const openMessage = async (msg: AccountMessage) => {
    setSelectedId(msg.id);
    if (!msg.read_at) {
      try {
        await apiClient.post(`/drivers/me/messages/${msg.id}/read`);
        setItems((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, read_at: new Date().toISOString() } : m)),
        );
      } catch {
        /* best-effort */
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Navbar
        title="Mensajes de Lifty"
        onBack={() => {
          if (selected) setSelectedId(null);
          else navigation.goBack();
        }}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : selected ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <Card style={styles.detailCard}>
            <Text style={styles.detailTitle}>{selected.title || 'Aviso de Lifty'}</Text>
            <Text style={styles.detailDate}>{formatArDate(selected.created_at)}</Text>
            <Text style={styles.detailBody}>{selected.body}</Text>
            {selected.type === 'review_notes' ? (
              <Button
                title="Ir a documentos"
                onPress={() =>
                  navigation.navigate('OnboardingStep2', {
                    reviewReason: selected.body,
                  })
                }
                style={styles.cta}
              />
            ) : null}
          </Card>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={theme.colors.primary}
            />
          }
        >
          {items.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="mail-open-outline" size={36} color={theme.colors.mediumGray} />
              <Text style={styles.emptyTitle}>Sin avisos</Text>
              <Text style={styles.emptyBody}>
                Acá van a aparecer los mensajes que te envíe el equipo de Lifty sobre tu cuenta y
                documentación.
              </Text>
            </Card>
          ) : (
            items.map((msg) => {
              const unread = !msg.read_at;
              return (
                <TouchableOpacity
                  key={msg.id}
                  onPress={() => void openMessage(msg)}
                  accessibilityRole="button"
                  accessibilityLabel={msg.title}
                >
                  <Card style={[styles.rowCard, unread ? styles.rowUnread : null]}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {msg.title || 'Aviso de Lifty'}
                      </Text>
                      {unread ? <View style={styles.dot} /> : null}
                    </View>
                    <Text style={styles.rowDate}>{formatArDate(msg.created_at)}</Text>
                    <Text style={styles.rowPreview} numberOfLines={2}>
                      {msg.body}
                    </Text>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  emptyCard: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  emptyBody: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 20,
  },
  rowCard: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  rowUnread: {
    borderColor: theme.colors.primary,
    borderWidth: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  rowTitle: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  rowDate: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  rowPreview: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    lineHeight: 20,
  },
  detailCard: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  detailTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  detailDate: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  detailBody: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    lineHeight: 24,
  },
  cta: {
    marginTop: theme.spacing.sm,
  },
});
