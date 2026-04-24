export const shaderFunctions = `
  // This uniform sampler2D represents the image from which i am sampling color values
  
  uniform sampler2D uTexture;
  uniform int uMode;

  const float PI = 3.14159265358979323846; //PI is needed for angle calculations in color spaces like hue (LCH)

  // sample RGB color from texture based on UV coordinates
  
  vec3 sampleRGB(vec2 uv) {
    return texture2D(uTexture, uv).rgb;   // This fetches the color at the given pixel location
  }

  // From sRGB to linear RGB
  // Based on the equation:
  // Clin = C / 12.92 for C <= 0.04045, and Clin = ((C + 0.055) / 1.055)^2.4 for C > 0.04045
  // This step is necessary because the RGB color model typically uses gamma correction (sRGB),
  // but we need linear RGB for accurate color computations
  
  vec3 srgbToLinear(vec3 c) {
    vec3 low = c / 12.92;
    vec3 high = pow((c + 0.055) / 1.055, vec3(2.4));

    return vec3(
      c.r <= 0.04045 ? low.r : high.r,
      c.g <= 0.04045 ? low.g : high.g,
      c.b <= 0.04045 ? low.b : high.b
    );
  }

  // RGB to HSV conversion
  // If the maximum channel (Cmax) is zero, S becomes zero since no color exists.
  // I also normalize H to [0, 1] because we're using the full range (0° to 360°) in other color models.
  
  vec3 rgbToHsv(vec3 c) {
    float r = c.r;
    float g = c.g;
    float b = c.b;

    float maxC = max(r, max(g, b));
    float minC = min(r, min(g, b));
    float delta = maxC - minC;

    float h = 0.0;
    float s = 0.0;
    float v = maxC;

    if (maxC > 0.0) {
      s = delta / maxC; // Saturation is based on how much the color deviates from gray
    }

    if (delta > 0.0) {
      if (maxC == r) {
        h = (g - b) / delta;
        if (g < b) h += 6.0;  // Hue should always be positive
      } else if (maxC == g) {
        h = (b - r) / delta + 2.0;
      } else {
        h = (r - g) / delta + 4.0;
      }
      h /= 6.0;  // Normalize to [0, 1] since H in degrees is 0° to 360°
    }

    return vec3(h, s, v);
  }

  // RGB to XYZ conversion

  vec3 rgbToXyz(vec3 rgb) {
    vec3 c = srgbToLinear(rgb); // Convert from gamma-corrected sRGB to linear RGB

    // Matrix multiplication to convert RGB to XYZ
    float X = 0.4124564 * c.r + 0.3575761 * c.g + 0.1804375 * c.b;
    float Y = 0.2126729 * c.r + 0.7151522 * c.g + 0.0721750 * c.b;
    float Z = 0.0193339 * c.r + 0.1191920 * c.g + 0.9503041 * c.b;

    return vec3(X, Y, Z);
  }

  // XYZ to xyY color space
  // x = X / (X + Y + Z), y = Y / (X + Y + Z), Y = Y (brightness remains unchanged)
  // The sum X + Y + Z gives the total light intensity, and x and y define the color

  vec3 xyzToXyY(vec3 xyz) {
    float sum = xyz.x + xyz.y + xyz.z;

    // Even though the equation states to use zero, I used 0.00001 because if it is exactly zero, division would result in NaN. 

    if (sum <= 0.00001) {
      return vec3(0.0, 0.0, 0.0); // If the color is black (or very dark), return 0
    }

    float x = xyz.x / sum;
    float y = xyz.y / sum;
    float Y = xyz.y;

    return vec3(x, y, Y);
  }

  // Helper function for Lab conversion to handle gamma correction
  // This ensures that small values close to zero (dark colors) are adjusted using a cubic function.
  
  float fLab(float t) {
    float delta = 6.0 / 29.0;
    float delta3 = delta * delta * delta;

    // Threshold for the gamma correction
    if (t > delta3) {
      return pow(t, 1.0 / 3.0); // Standard cubic root transformation for linear values
    } else {
      return t / (3.0 * delta * delta) + 4.0 / 29.0; // Adjust for values near black
    }
  }

  // XYZ to Lab conversion using D65 reference white
  // L* is lightness, a* is green-red, and b* is blue-yellow. I added a division of 100 for L* to scale it to a 0-1 range for visualization.
  
  vec3 xyzToLab(vec3 xyz) {
    float Xn = 0.95047; // D65 reference white point
    float Yn = 1.00000;
    float Zn = 1.08883;

    float fx = fLab(xyz.x / Xn); // Normalize and apply gamma correction
    float fy = fLab(xyz.y / Yn);
    float fz = fLab(xyz.z / Zn);

    // Calculate Lab components
    float L = 116.0 * fy - 16.0;
    float a = 500.0 * (fx - fy);
    float b = 200.0 * (fy - fz);

    return vec3(L, a, b);
  }

  // Lab to LCH
  
  vec3 labToLch(vec3 lab) {
    float L = lab.x;
    float a = lab.y;
    float b = lab.z;

    float C = sqrt(a * a + b * b); // Chroma is the distance from the center of the color wheel
    float h = atan(b, a) / (2.0 * PI); // Hue is calculated based on the angle of a and b

    if (h < 0.0) {
      h += 1.0;
    }

    return vec3(L, C, h);
  }

  // RGB to HSV conversion
  // We calculate the max (Cmax) and min (Cmin) values of RGB, then compute the differences
  // The formula handles the hue calculation differently based on which color channel is the maximum.
  // After calculating H, I normalize it to a [0, 1] range by dividing by 360° to get a value between 0 and 1.
  
  vec3 getColorSpaceValue(vec3 rgb) {
    vec3 hsv = rgbToHsv(rgb);
    vec3 xyz = rgbToXyz(rgb);
    vec3 xyy = xyzToXyY(xyz);
    vec3 lab = xyzToLab(xyz);
    vec3 lch = labToLch(lab);

    if (uMode == 0) {
      return rgb;
    } else if (uMode == 1) {
      return hsv; 
    } else if (uMode == 2) {
      // XYZ mode: I normalize the XYZ values by the D65 reference white point to scale them to a [0, 1] range for visualization.
      return vec3(
        clamp(xyz.x / 0.95047, 0.0, 1.0),
        clamp(xyz.y / 1.00000, 0.0, 1.0),
        clamp(xyz.z / 1.08883, 0.0, 1.0)
      );
    } else if (uMode == 3) {
      return vec3(
        clamp(xyy.x, 0.0, 1.0),
        clamp(xyy.y, 0.0, 1.0),
        clamp(xyy.z, 0.0, 1.0)
      );
    } else if (uMode == 4) {
      return vec3(
        clamp(lab.x / 100.0, 0.0, 1.0),
        clamp((lab.y + 128.0) / 255.0, 0.0, 1.0), 
        clamp((lab.z + 128.0) / 255.0, 0.0, 1.0) 
      );
    } else {
      return vec3(
        clamp(lch.x / 100.0, 0.0, 1.0), 
        clamp(lch.y / 150.0, 0.0, 1.0), 
        clamp(lch.z, 0.0, 1.0) // Hue is already in [0, 1]
      );
    }
  }

  // Map RGB to a 3D position for visualization
  
  vec3 getDistributionPosition(vec3 rgb) {
    vec3 value = getColorSpaceValue(rgb);

    if (uMode == 0 || uMode == 1 || uMode == 2) {
      return value - 0.5; // Center the points around the origin
    } else if (uMode == 3) {
      return vec3(
        value.x - 0.5,
        value.z - 0.5,
        value.y - 0.5
      );
    } else if (uMode == 4) {
      return vec3(
        value.y - 0.5,
        value.x - 0.5,
        value.z - 0.5
      );
    } else {
      float angle = value.z * 2.0 * PI;
      float radius = value.y * 0.5;

      return vec3(
        cos(angle) * radius,
        value.x - 0.5,
        sin(angle) * radius
      );
    }
  }
`;