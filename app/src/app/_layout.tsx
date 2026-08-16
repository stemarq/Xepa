/**
 * Raiz do app: carrega a Poppins, monta o provedor de sessão e segura a splash
 * até tudo estar pronto.
 *
 * A decisão de para onde ir (login ou banca) é dos layouts de grupo — aqui
 * ainda não se sabe se existe sessão guardada no aparelho.
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import { SessaoProvider } from '@/contexts/SessaoContext';
import { ToastProvider } from '@/components/ui/Toast';
import { cores } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function LayoutRaiz() {
  const [fontesProntas, erroDeFonte] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  useEffect(() => {
    // Se a fonte falhar, seguimos com a de sistema — melhor que travar na splash.
    if (fontesProntas || erroDeFonte) void SplashScreen.hideAsync();
  }, [fontesProntas, erroDeFonte]);

  if (!fontesProntas && !erroDeFonte) return null;

  return (
    <SafeAreaProvider>
      {/*
        Acima do Stack: o recado precisa sobreviver à troca de rota — a ação
        que falhou pode ser a última coisa antes de sair da tela.
      */}
      <ToastProvider>
        <SessaoProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: cores.fundo },
            }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(banca)" />
            <Stack.Screen name="perfil" options={{ presentation: 'modal' }} />
            {/* Detalhe da matéria (SD20): empilha sobre as abas, não é uma delas. */}
            <Stack.Screen name="materia/[id]" />
            {/* Open Finance (SD25–SD27): entra pela Grana, fora das abas. */}
            <Stack.Screen name="bancos" />
            {/* Leitura de nota (SD06): entra pela Despensa, fora das abas. */}
            <Stack.Screen name="nota" />
          </Stack>
        </SessaoProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
