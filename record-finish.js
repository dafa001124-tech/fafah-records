import * as THREE from 'three';

// A clear lacquer pass over the colour-faithful artwork. Only local neutral
// reflections contribute alpha; unlit areas leave the original image untouched.
export function createRecordFinish() {
  const material = new THREE.ShaderMaterial({
    name: 'Clear vinyl lacquer — neutral directional sheen',
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {opacity: {value: 1}},
    vertexShader: `
      varying vec2 face;
      varying vec3 viewDirection, faceNormal, radialDirection;
      varying vec3 keyDirection, fillDirection;
      void main() {
        face = position.xy / 1.514;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        viewDirection = -viewPosition.xyz;
        faceNormal = normalize(normalMatrix * normal);
        radialDirection = normalMatrix * vec3(position.xy, 0.0);
        keyDirection = mat3(viewMatrix) * normalize(vec3(-0.65, 0.75, 1.0));
        fillDirection = mat3(viewMatrix) * normalize(vec3(0.8, 0.15, 1.0));
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec2 face;
      varying vec3 viewDirection, faceNormal, radialDirection;
      varying vec3 keyDirection, fillDirection;
      float reflection(vec3 light, vec3 view, vec3 normal, vec3 radial) {
        vec3 halfway = normalize(normalize(light) + view);
        vec3 tangent = normalize(cross(normal, radial));
        float nh = max(dot(normal, halfway), 0.001);
        float across = dot(halfway, radial) / 0.46;
        float along = dot(halfway, tangent) / 0.10;
        return exp(-(across * across + along * along) / (nh * nh));
      }
      void main() {
        float radius = length(face);
        vec3 view = normalize(viewDirection);
        vec3 normal = normalize(faceNormal);
        vec3 radial = normalize(radialDirection);
        float sheen = reflection(keyDirection, view, normal, radial)
          + 0.38 * reflection(fillDirection, view, normal, radial);
        // Filter subpixel grooves analytically, so distant discs do not shimmer.
        float phase = radius * 942.478;
        float groove = (0.5 + 0.5 * cos(phase))
          * (1.0 - smoothstep(0.6, 3.0, fwidth(phase)));
        float tracks = 0.0;
        float width = max(fwidth(radius), 0.0006);
        tracks += 1.0 - smoothstep(0.0005, 0.0005 + width, abs(radius - 0.48));
        tracks += 1.0 - smoothstep(0.0005, 0.0005 + width, abs(radius - 0.704));
        tracks += 1.0 - smoothstep(0.0005, 0.0005 + width, abs(radius - 0.939));
        float grazing = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
        float edge = smoothstep(0.982, 0.998, radius);
        // Leave the printed centre label matte. No all-over grey/white veil.
        float mask = smoothstep(0.345, 0.365, radius);
        float alpha = mask * (sheen * (0.14 + 0.04 * groove + 0.05 * tracks)
          + edge * (0.035 + 0.16 * grazing));
        gl_FragColor = vec4(vec3(1.0), min(alpha, 0.22) * opacity);
      }
    `,
  });
  material.userData.recordFinish = true;
  return material;
}

export function attachRecordFinish(record, material, geometry) {
  return ['Vinyl playing surface', 'Vinyl reverse playing surface'].map(name => {
    const surface = record.getObjectByName(name);
    const coat = new THREE.Mesh(geometry, material);
    coat.name = `${name} — clear lacquer`;
    coat.position.z = 0.0008;
    coat.visible = false;
    coat.renderOrder = 1;
    surface.add(coat);
    return coat;
  });
}
