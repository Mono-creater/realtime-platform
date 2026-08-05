<!-- 线路监控组件 -- 地铁线路旧！ -->
<template>
  <!-- 线路监控组件 -- 地铁线路 -->
  <div class="lineBox">
    <div class="line" ref="lineRef">
      <!-- 线路背景图 -->
      <div class="img"></div>
      <!-- 动态小车 -->
      <div v-for="car in cars" :key="car.num" class="car-wrapper" :style="getCarWrapperStyle(car)">
        <img class="car-img" :src="carImg" :style="getCarImgStyle(car)" alt="car" />
        <span class="car-num" :style="getCarNumStyle(car)">{{ car.num }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import carImg from '@/assets/images/car.png'

// 1. 轨迹点设计

// 轨迹点加 type 字段，便于后续判断区间类型
const upLine = [
  { x: 0.11, y: 0.05, type: 'upLine' },
  { x: 0.166, y: 0.05, type: 'upLine' },
  { x: 0.222, y: 0.05, type: 'upLine' },
  { x: 0.278, y: 0.05, type: 'upLine' },
  { x: 0.334, y: 0.05, type: 'upLine' },
  { x: 0.39, y: 0.05, type: 'upLine' },
  { x: 0.446, y: 0.05, type: 'upLine' },
  { x: 0.502, y: 0.05, type: 'upLine' },
  { x: 0.558, y: 0.05, type: 'upLine' },
  { x: 0.614, y: 0.05, type: 'upLine' },
  { x: 0.67, y: 0.05, type: 'upLine' },
  { x: 0.726, y: 0.05, type: 'upLine' },
  { x: 0.782, y: 0.05, type: 'upLine' },
  { x: 0.838, y: 0.05, type: 'upLine' },
  { x: 0.894, y: 0.05, type: 'upLine' },
]
const downLine = [
  { x: 0.91, y: 0.97, type: 'downLine' },
  { x: 0.86, y: 0.97, type: 'downLine' },
  { x: 0.81, y: 0.97, type: 'downLine' },
  { x: 0.76, y: 0.97, type: 'downLine' },
  { x: 0.71, y: 0.97, type: 'downLine' },
  { x: 0.65, y: 0.97, type: 'downLine' },
  { x: 0.59, y: 0.97, type: 'downLine' },
  { x: 0.53, y: 0.97, type: 'downLine' },
  { x: 0.47, y: 0.97, type: 'downLine' },
  { x: 0.41, y: 0.97, type: 'downLine' },
  { x: 0.35, y: 0.97, type: 'downLine' },
  { x: 0.29, y: 0.97, type: 'downLine' },
  { x: 0.23, y: 0.97, type: 'downLine' },
  { x: 0.17, y: 0.97, type: 'downLine' },
  { x: 0.11, y: 0.97, type: 'downLine' },
]
const rightLoop = [
  { x: 0.915, y: 0.05, type: 'rightLoop' }, // 上线最右
  { x: 0.915, y: 0.97, type: 'rightLoop' }, // 下线最右
]
const leftLoop = [
  { x: 0.05, y: 0.97, type: 'leftLoop' }, // 下线最左
  { x: 0.05, y: 0.05, type: 'leftLoop' }, // 上线最左
]
// 完整轨迹，reverse 后顺序不变，但 type 信息保留
const fullPath = [...downLine, ...leftLoop, ...upLine, ...rightLoop].reverse()

// 2. 小车数据
const cars = reactive([
  { num: '521', progress: 0.0 },
  { num: '541', progress: 0.037 },
  { num: '539', progress: 0.074 },
  { num: '518', progress: 0.111 },
  { num: '524', progress: 0.148 },
  { num: '534', progress: 0.185 },

  { num: '540', progress: 0.222 },
  { num: '523', progress: 0.259 },
  { num: '531', progress: 0.296 },
  { num: '543', progress: 0.333 },
  { num: '545', progress: 0.37 },

  { num: '519', progress: 0.407 },
  { num: '507', progress: 0.444 },
  { num: '506', progress: 0.481 },
  { num: '544', progress: 0.518 },
  { num: '504', progress: 0.555 },

  { num: '533', progress: 0.592 },
  { num: '505', progress: 0.629 },
  { num: '534', progress: 0.666 },
  { num: '524', progress: 0.703 },
  { num: '523', progress: 0.74 },

  { num: '531', progress: 0.777 },
  { num: '520', progress: 0.814 },
  { num: '519', progress: 0.851 },
  { num: '507', progress: 0.888 },
  { num: '506', progress: 0.925 },

  { num: '544', progress: 0.962 },
])
// 3. 运动动画
function updateCars() {
  const total = fullPath.length
  for (const car of cars) {
    // 速度可调节
    car.progress += 0.0001
    if (car.progress > 1) car.progress -= 1

    // 计算当前在哪两个点之间
    const pos = car.progress * (total - 1)
    const idx = Math.floor(pos)
    const nextIdx = (idx + 1) % total
    const percent = pos - idx

    // 插值计算坐标
    const x = fullPath[idx].x + (fullPath[nextIdx].x - fullPath[idx].x) * percent
    const y = fullPath[idx].y + (fullPath[nextIdx].y - fullPath[idx].y) * percent

    car.x = x
    car.y = y

    // 记录方向
    car.isRight = fullPath[nextIdx].x > fullPath[idx].x

    // 判断当前区间是否为左右回路（type为leftLoop或rightLoop）
    // 只在回路区间倾斜，其余保持水平
    const idxType = fullPath[idx].type
    const nextIdxType = fullPath[nextIdx].type
    const inLoop =
      (idxType === 'leftLoop' && nextIdxType === 'leftLoop') ||
      (idxType === 'rightLoop' && nextIdxType === 'rightLoop')
    if (inLoop) {
      // 计算当前区间的切线角度（deg）
      const dx = fullPath[nextIdx].x - fullPath[idx].x
      const dy = fullPath[nextIdx].y - fullPath[idx].y
      car.angle = -(Math.atan2(dy, dx) * 180) / Math.PI
    } else {
      // 非回路区间保持水平
      car.angle = 0
    }
  }
  requestAnimationFrame(updateCars)
}

onMounted(() => {
  updateCars()
})

// 4. 样式计算
// 小车容器只做位置平移
function getCarWrapperStyle(car) {
  return {
    left: `${car.x * 100}%`,
    top: `${car.y * 100}%`,
    transform: 'translate(-50%, -50%)',
  }
}
// 小车图片旋转和镜像
function getCarImgStyle(car) {
  return {
    width: '20px',
    height: '15px',
    transform: `rotate(${car.angle}deg) ${car.isRight ? 'scaleX(-1)' : ''}`,
  }
}
function getCarNumStyle(car) {
  const inLoop = car.angle !== 0
  // 你可以根据图片实际高度微调 translateY的数值
  const offset = 5 // 单位px，数字距离车底的距离
  if (inLoop) {
    // 先旋转，再向下平移 offset 像素
    return {
      transform: `rotate(${car.angle}deg) translateY(${offset}px)`,
    }
  } else {
    // 主线区间，直接向下平移
    return {
      transform: `translateY(${offset}px)`,
    }
  }
}
</script>

<style scoped>
.lineBox {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}
.line {
  margin-top: 15px;
  width: 90%;
  aspect-ratio: 1637 / 165;
  position: relative;
}
.img {
  width: 100%;
  height: 100%;
  margin: 0 auto;
  background-image: url('../assets/images/line.png');
  background-size: cover;
  background-repeat: no-repeat;
}
.car-wrapper {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  z-index: 2;
}
.car-img {
  width: 10px;
  height: 12px;
}
.car-num {
  color: #304882;
  font-size: 8px;
  font-weight: bold;
  margin-top: -5px;
  text-shadow: 0 0 2px #000;
  pointer-events: none;
}
</style>
