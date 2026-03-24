import React, { Suspense, lazy, type ComponentType } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});

export function createLazyScreen<TProps extends object>(
  loader: () => Promise<{ default: ComponentType<TProps> }>
) {
  const LazyScreen = lazy(loader);

  function ScreenWrapper(props: TProps) {
    return (
      <Suspense
        fallback={
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.purple} />
          </View>
        }
      >
        <LazyScreen {...props} />
      </Suspense>
    );
  }

  ScreenWrapper.displayName = "LazyScreenWrapper";
  return ScreenWrapper;
}
