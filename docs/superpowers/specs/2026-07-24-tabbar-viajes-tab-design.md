# Agregar pestaña "Viajes" al TabBar

Issue: #134

## Resumen

Agregar una 4ta pestaña "Viajes" (🚗) al componente `TabBar` para navegar al `TripHistoryScreen`, actualizando todos los screens que usan el TabBar y extrayendo un tipo `TabKey` compartido.

## Cambios

### 1. `TabBar.tsx` — Componente
- Agregar `'trips'` al tipo `activeTab`: `'home' | 'earnings' | 'trips' | 'profile'`
- Agregar tab `{ key: 'trips', label: 'Viajes', icon: '🚗' }` al array `tabs`
- Exportar tipo `TabKey` para que los screens no dupliquen la unión literal
- Ajustar `paddingHorizontal` de `xl` a `md` para dar espacio a 4 íconos

### 2. Screens existentes — agregar navegación a trips
Cada screen que usa TabBar debe:
- Importar `TabKey` de `TabBar.tsx` en lugar de repetir la unión literal
- Agregar `'trips'` en `handleTabPress`: navegar a `TripHistory` cuando se presiona el tab trips
- Equivalente al patrón existente: cada screen navega a los otros tabs excepto al propio

### 3. `TripHistoryScreen.tsx` — agregar TabBar
- Agregar TabBar con `activeTab='trips'`
- Navegación: "Inicio" → Online/Active, "Cobros" → Earnings, "Viajes" → nada (ya está), "Perfil" → Profile
- Mantener el Navbar superior existente (título "Historial" + botón atrás)

### 4. `TripCompleteScreen.tsx` — arreglar navegación
- Actualmente `onTabPress` solo actualiza estado visual sin navegar realmente. Se corrige para que cada tab navegue a su screen correspondiente.

## Afectados
- `src/components/TabBar.tsx`
- `src/screens/OnlineScreen.tsx`
- `src/screens/EarningsScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/TripCompleteScreen.tsx`
- `src/screens/TripHistoryScreen.tsx`

## No afectados
- Tema, colores, estilos existentes
- Rutas, layout de expo-router
- Backend
