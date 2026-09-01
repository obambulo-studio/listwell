<template>
  <div class="flex flex-col min-h-screen">
    <TheNavbar />
    <slot />
    <footer class="text-center text-xs text-gray-500 mt-auto w-full pb-3 pt-6">
      © {{ new Date().getFullYear() }} Listwell
    </footer>
  </div>
</template>