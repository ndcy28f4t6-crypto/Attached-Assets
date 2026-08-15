import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppState } from '@/context/AppStateContext';
import type { Project, Task } from '@workspace/api-client-react';

// ─────────────────────────────────────────────────────────
// Project Card
// ─────────────────────────────────────────────────────────

function ProjectCard({
  project,
  taskCount,
  doneCount,
  colors,
}: {
  project: Project;
  taskCount: number;
  doneCount: number;
  colors: ReturnType<typeof useColors>;
}) {
  const styles = makeStyles(colors);
  const progress = taskCount > 0 ? doneCount / taskCount : 0;

  return (
    <View style={styles.card}>
      {/* Color strip */}
      <View style={[styles.colorStrip, { backgroundColor: project.color }]} />

      <View style={styles.cardBody}>
        {/* Top row: name + task count */}
        <View style={styles.cardTop}>
          <Text style={styles.projectName} numberOfLines={1}>
            {project.name}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: project.color + '33' }]}>
            <Text style={[styles.countText, { color: project.color }]}>
              {doneCount}/{taskCount}
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.projectDesc} numberOfLines={2}>
          {project.description}
        </Text>

        {/* Goal */}
        <View style={styles.goalRow}>
          <Feather name="target" size={13} color={colors.mutedForeground} />
          <Text style={styles.goalText} numberOfLines={1}>
            {project.goal}
          </Text>
        </View>

        {/* Progress bar */}
        {taskCount > 0 && (
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor: project.color,
                },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, isLoading, isError, refetch } = useAppState();
  const styles = makeStyles(colors);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

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
        <Text style={styles.errorText}>Couldn't load projects</Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const projects = state?.projects ?? [];
  const tasks = state?.tasks ?? [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: topPad + 20,
          paddingBottom: Platform.OS === 'web' ? 84 + 34 : 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.subtitle}>
          {projects.length} active {projects.length === 1 ? 'project' : 'projects'}
        </Text>
      </View>

      {/* Project cards */}
      {projects.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="folder" size={40} color={colors.accent} />
          <Text style={styles.emptyTitle}>No projects yet</Text>
          <Text style={styles.emptySubtitle}>
            Add projects from the web app to see them here.
          </Text>
        </View>
      ) : (
        projects.map((project: Project) => {
          const projectTasks = tasks.filter(
            (t: Task) => t.project === project.name,
          );
          const doneTasks = projectTasks.filter((t: Task) => t.done);
          return (
            <ProjectCard
              key={project.id}
              project={project}
              taskCount={projectTasks.length}
              doneCount={doneTasks.length}
              colors={colors}
            />
          );
        })
      )}

      {/* Summary strip */}
      {projects.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{tasks.length}</Text>
            <Text style={styles.summaryLabel}>Total tasks</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((t: Task) => t.done).length}
            </Text>
            <Text style={styles.summaryLabel}>Completed</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((t: Task) => !t.done && t.due === 'Today').length}
            </Text>
            <Text style={styles.summaryLabel}>Due today</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

    header: { marginBottom: 24 },
    title: {
      fontSize: 30,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'DMSans_700Bold',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
    },

    // Card
    card: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      marginBottom: 14,
      overflow: 'hidden',
    },
    colorStrip: { width: 5 },
    cardBody: { flex: 1, padding: 16 },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    projectName: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'DMSans_700Bold',
      flex: 1,
      marginRight: 10,
    },
    countBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
    },
    countText: {
      fontSize: 13,
      fontWeight: '700' as const,
      fontFamily: 'DMSans_700Bold',
    },
    projectDesc: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      lineHeight: 20,
      marginBottom: 10,
    },
    goalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    goalText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
      flex: 1,
    },
    progressBar: {
      height: 4,
      backgroundColor: colors.muted,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 2 },

    // Summary
    summaryRow: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      marginTop: 8,
      padding: 20,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryNumber: {
      fontSize: 24,
      fontWeight: '700' as const,
      color: colors.primary,
      fontFamily: 'DMSans_700Bold',
      marginBottom: 2,
    },
    summaryLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
    },
    summaryDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
    },

    // Empty / error
    emptyState: {
      alignItems: 'center',
      paddingTop: 50,
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
    errorText: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'DMSans_500Medium' },
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
