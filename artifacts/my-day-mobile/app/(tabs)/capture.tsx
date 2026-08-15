import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppState } from '@/context/AppStateContext';
import type { Capture } from '@workspace/api-client-react';

// ─────────────────────────────────────────────────────────
// Capture Card
// ─────────────────────────────────────────────────────────

const CaptureCard = React.memo(
  ({
    capture,
    onDelete,
    colors,
  }: {
    capture: Capture;
    onDelete: (id: string) => void;
    colors: ReturnType<typeof useColors>;
  }) => {
    const styles = makeStyles(colors);
    return (
      <View style={styles.captureCard}>
        {capture.converted && (
          <View style={styles.convertedBadge}>
            <Feather name="check-circle" size={11} color={colors.accentForeground} />
            <Text style={styles.convertedText}>Converted</Text>
          </View>
        )}
        <Text style={styles.captureText}>{capture.text}</Text>
        <View style={styles.captureFooter}>
          <Text style={styles.captureTime}>{capture.createdAt}</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDelete(capture.id);
            }}
            hitSlop={12}
          >
            <Feather name="trash-2" size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    );
  },
);

// ─────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, isLoading, isSaving, addCapture, deleteCapture } = useAppState();
  const styles = makeStyles(colors);

  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addCapture(trimmed);
    setText('');
    inputRef.current?.blur();
  };

  const captures = state?.captures ?? [];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 20 }]}>
        <Text style={styles.title}>Capture</Text>
        <Text style={styles.subtitle}>
          Drop a thought before it slips away
        </Text>
      </View>

      {/* Input card */}
      <View style={styles.inputCard}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          blurOnSubmit
        />
        <View style={styles.inputFooter}>
          <Text style={styles.charCount}>{text.length}/500</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={!text.trim() || isSaving}
            style={({ pressed }) => [
              styles.sendBtn,
              (!text.trim() || isSaving) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
            testID="submit-capture"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="arrow-up" size={18} color={colors.primaryForeground} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Captures list */}
      <FlatList
        data={captures}
        keyExtractor={(item) => item.id}
        scrollEnabled={captures.length > 0}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 84 + 34 : 100 },
        ]}
        ListHeaderComponent={
          captures.length > 0 ? (
            <Text style={styles.listLabel}>Recent captures</Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="inbox" size={36} color={colors.accent} />
              <Text style={styles.emptyTitle}>Nothing captured yet</Text>
              <Text style={styles.emptySubtitle}>
                Type above to save a thought, idea, or reminder.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CaptureCard
            capture={item}
            onDelete={deleteCapture}
            colors={colors}
          />
        )}
      />
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },

    header: { paddingHorizontal: 24, paddingBottom: 16 },
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

    // Input card
    inputCard: {
      marginHorizontal: 20,
      marginBottom: 8,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 16,
    },
    input: {
      fontSize: 16,
      color: colors.foreground,
      fontFamily: 'DMSans_400Regular',
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 12,
    },
    inputFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    charCount: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
    },
    sendBtn: {
      backgroundColor: colors.primary,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnPressed: { opacity: 0.8 },

    // List
    listContent: { paddingHorizontal: 20, paddingTop: 4 },
    listLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.mutedForeground,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
      marginBottom: 12,
      marginTop: 16,
      fontFamily: 'DMSans_600SemiBold',
    },

    // Capture card
    captureCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 14,
      marginBottom: 10,
    },
    convertedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accent,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: 'flex-start',
      marginBottom: 8,
    },
    convertedText: {
      fontSize: 11,
      fontWeight: '600' as const,
      color: colors.accentForeground,
      fontFamily: 'DMSans_600SemiBold',
    },
    captureText: {
      fontSize: 15,
      color: colors.foreground,
      fontFamily: 'DMSans_400Regular',
      lineHeight: 22,
      marginBottom: 10,
    },
    captureFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    captureTime: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'DMSans_400Regular',
    },

    // Empty
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
  });
}
