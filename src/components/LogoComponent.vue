<template>
  <!-- 左上角LOGO -->
  <div class="logos">
    <div class="sz-logo">
      <div class="sz-logo-img" style="width: 30px; height: 30px"></div>
      <span>深铁运营</span>
    </div>
    <div class="yg-logo">
      <div class="yg-logo-img" style="width: 30px; height: 30px"></div>
      <span>驭弓大师</span>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
@font-face {
  font-family: 'FZYTJW';
  src: url('@/assets/fonts/FZYTJW.TTF') format('truetype');
  font-weight: normal;
  font-style: normal;
}
.logos {
  font-family: 'FZYTJW', sans-serif;
  color: #fff;
  padding-left: 10px;
}
.sz-logo {
  display: flex;
  align-items: center;
  font-size: 20px;
  gap: 10px;
  margin: 10px 0 5px 0;
  filter: blur(5px);
}
.yg-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
}
.sz-logo-img {
  background-image: url('@/assets/images/sz_logo.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
.yg-logo-img {
  background-image: url('@/assets/images/yg_logo.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
</style>