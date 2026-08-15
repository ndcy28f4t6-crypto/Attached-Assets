import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppState } from '@/context/AppStateContext';
import type { Task } from '@workspace/api-client-react';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function priorityColor(
  priority: string,
  colors: ReturnType<typeof useColors>,
): string {
  if (priority === 'high') return colors.priorityHigh;
  if (priority === 'medium') return colors.priorityMedium;
  return colors.priorityLow;
}

// ─────────────────────────────────────────────────────────
// Task Row
// ─────────────────────────────────────────────────────────

const TaskRow = React.memo(
  ({
    task,
    onToggle,
    colors,
  }: {
    task: Task;
    onToggle: (id: string) => void;
    colors: ReturnType<typeof useColors>;
  }) => {
    const styles = makeStyles(colors);

    const handleToggle = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggle(task.id);
    }, [task.id, onToggle]);

    const dotColor = priorityColor(task.priority, colors);

    return (
      <View style={styles.taskCard}>
        {/* Priority strip */}
        <View style={[styles.priorityStrip, { backgroundColor: dotColor }]} />

        {/* Checkbox */}
        <Pressable
          onPress={handleToggle}
          style={({ pressed }) => [styles.checkbox, pressed && styles.checkboxPressed]}
          testID={`checkbox-${task.id}`}
        >
          {task.done && (
            <Feather name="check" size={13} color={colors.primaryForeground} />
          )}
        </Pressable>

        {/* Content */}
        <View style={styles.taskContent}>
          <Text
            style={[styles.taskTitle, task.done && styles.taskTitleDone]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          <View style={styles.taskMeta}>
            <View style={styles.projectBadge}>
              <Text style={styles.projectText} numberOfLines={1}>
                {task.project}
              </Text>
            </View>
            {!!task.time && (
              <Text style={styles.timeText}>{task.time}</Text>
            )}
          </View>
        </View>
      </View>
    );
  },
);

// ─────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────

function SectionLabel({
  label,
  count,
  colors,
}: {
  label: string;
  count: number;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600' as const, color: colors.mutedForeground, letterSpacing: 0.8, textTransform: 'uppercase' as const }}>
        {label}
      </Text>
      <View style={{ backgroundColor: colors.muted, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '600' as const, color: colors.mutedForeground }}>{count}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, isLoading, isError, isSaving, refetch, toggleTask } = useAppState();
  const styles = makeStyles(colors);

  const todayTasks = (state?.tasks ?? []).filter((t: Task) => t.due === 'Today');
  const pending = todayTasks.filter((t: Task) => !t.done);
  const done = todayTasks.filter((t: Task) => t.done);

  // Build a flat list of items for FlatList (section headers + tasks)
  type ListItem =
    | { kind: 'header'; label: string; count: number }
    | { kind: 'task'; task: Task };

  const items: ListItem[] = [];
  if (pending.length > 0) {
    items.push({ kind: 'header', label: 'Today', count: pending.length });
    pending.forEach((t: Task) => items.push({ kind: 'task', task: t }));
  }
  if (done.length > 0) {
    items.push({ kind: 'header', label: 'Done', count: done.length });
    done.forEach((t: Task) => items.push({ kind: 'task', task: t }));
  }

  const topPad =
    Platform.OS === 'web'
      ? 67
      : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
        <Text style={styles.errorText}>Couldn't load your tasks</Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={items}
        keyExtractor={(item, idx) =>
          item.kind === 'header' ? `hdr-${idx}` : item.task.id
        }
        scrollEnabled={items.length > 0}
        contentInsetAdjustmentBehavior="never"
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: topPad + 20 }]}>
            {isSaving && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.savingIndicator}
              />
            )}
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.dateLabel}>{formatDate()}</Text>
            {todayTasks.length > 0 && (
              <View style={styles.progressRow}>
                <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${Math.round((done.length / todayTasks.length) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {done.length} of {todayTasks.length} done
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="sun" size={40} color={colors.accent} />
            <Text style={styles.emptyTitle}>Nothing due today</Text>
            <Text style={styles.emptySubtitle}>
              Enjoy the breathing room — or add tasks from the web app.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <SectionLabel
                label={item.label}
                count={item.count}
                colors={colors}
              />
            );
          }
          return (
            <View style={styles.taskWrapper}>
              <TaskRow
                task={item.task}
                onToggle={toggleTask}
                colors={colors}
              />
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 84 + 34 : 100 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

    // Header
    header: { paddingHorizontal: 24, paddingBottom: 8 },
    savingIndicator: { position: 'absolute', top: 16, right: 16 },
    greeting: {
      fontSize: 30,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'DMSans_700Bold',
      marginBottom: 4,
    },
    dateLabel: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      marginBottom: 20,
    },

    // Progress
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    progressBar: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressLabel: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_500Medium',
    },

    // Task card
    taskWrapper: { paddingHorizontal: 20, marginBottom: 10 },
    taskCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      paddingRight: 14,
      paddingVertical: 14,
    },
    priorityStrip: { width: 4, alignSelf: 'stretch', marginRight: 14 },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    checkboxPressed: { opacity: 0.7 },
    taskContent: { flex: 1 },
    taskTitle: {
      fontSize: 15,
      fontWeight: '500' as const,
      color: colors.foreground,
      fontFamily: 'DMSans_500Medium',
      marginBottom: 6,
    },
    taskTitleDone: {
      textDecorationLine: 'line-through' as const,
      color: colors.mutedForeground,
    },
    taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    projectBadge: {
      backgroundColor: colors.secondary,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
      maxWidth: 160,
    },
    projectText: {
      fontSize: 12,
      color: colors.secondaryForeground,
      fontFamily: 'DMSans_500Medium',
    },
    timeText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
    },

    // Empty / error
    emptyState: {
      alignItems: 'center',
      paddingTop: 60,
      paddingHorizontal: 40,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.foreground,
      fontFamily: 'DMSans_600SemiBold',
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: 'center',
      fontFamily: 'DMSans_400Regular',
      lineHeight: 21,
    },
    errorText: {
      fontSize: 16,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_500Medium',
    },
    retryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
    },
    retryText: {
      color: colors.primaryForeground,
      fontWeight: '600' as const,
      fontSize: 14,
      fontFamily: 'DMSans_600SemiBold',
    },
  });
}
