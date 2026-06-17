// engine/Engine.js
/**
 * المحرك الرئيسي لنظام النمذجة ثلاثية الأبعاد
 * يقوم بتحويل بيانات النماذج (JSON) إلى كائنات Three.js قابلة للاستخدام
 * ويدعم العمليات الهندسية والتحويلات والتسلسل الهرمي
 */
 
 import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class ModelingEngine {
    constructor() {
        this.version = '1.0';
        this.scene = null;
        this.camera = null;
        this.renderer = null;
    }

    // ========== دوال بناء المشهد الأساسية ==========
    
    /**
     * تهيئة المشهد ثلاثي الأبعاد
     * @param {HTMLElement} container - العنصر الذي سيحتوي على المشهد
     * @param {Object} options - إعدادات إضافية
     */
    initScene(container, options = {}) {
        const { backgroundColor = 0x111122, fov = 45, near = 0.1, far = 1000 } = options;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(backgroundColor);
        
        // كاميرا منظور
        this.camera = new THREE.PerspectiveCamera(fov, container.clientWidth / container.clientHeight, near, far);
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
        
        // كاميرا إضافية للمنظورات المختلفة (يمكن تبديلها)
        this.orthographicCamera = null;
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true; // تفعيل الظلال
        container.appendChild(this.renderer.domElement);
        
        // إضافة شبكة إرشادية (Grid) ومحاور
        this.addHelperGrid();
        this.addAxesHelper();
        
        return { scene: this.scene, camera: this.camera, renderer: this.renderer };
    }
    
    addHelperGrid(size = 20, divisions = 20) {
        const gridHelper = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);
        this.scene.add(gridHelper);
        return gridHelper;
    }
    
    addAxesHelper(size = 5) {
        const axesHelper = new THREE.AxesHelper(size);
        this.scene.add(axesHelper);
        return axesHelper;
    }
    
    // ========== دوال إنشاء المجسمات من البيانات ==========
    
    /**
     * بناء مجسم Three.js كامل من بيانات النموذج (JSON)
     * @param {Object} modelData - بيانات النموذج (يجيب أن تكون مطابقة للصيغة)
     * @returns {THREE.Group} - مجموعة تحتوي على المجسم بأكمله (يحافظ على الهرمية)
     */
    build(modelData) {
        // التحقق من الصيغة والإصدار
        if (!modelData.version) modelData.version = '1.0';
        
        const rootGroup = new THREE.Group();
        rootGroup.userData = { metadata: modelData.metadata, originalData: modelData };
        
        // بناء المواد أولاً لتتوفر عند إنشاء الأوجه
        const materials = this.buildMaterials(modelData.materials || []);
        
        // بناء المجسمات (Meshes) حسب التسلسل الهرمي
        if (modelData.hierarchy && modelData.hierarchy.length) {
            this.buildHierarchy(rootGroup, modelData.hierarchy, materials, modelData);
        } else {
            // إذا لم يوجد تسلسل هرمي، نعتمد على المصفوفات المباشرة
            const mesh = this.buildMeshFromData(modelData, materials);
            rootGroup.add(mesh);
        }
        
        return rootGroup;
    }
    
    /**
     * بناء المواد من البيانات
     */
    buildMaterials(materialsData) {
        const materials = [];
        for (const mat of materialsData) {
            let material;
            if (mat.type === 'MeshStandardMaterial') {
                material = new THREE.MeshStandardMaterial({
                    color: mat.color || 0xffffff,
                    roughness: mat.roughness || 0.5,
                    metalness: mat.metalness || 0,
                    transparent: mat.transparent || false,
                    opacity: mat.opacity || 1,
                    emissive: mat.emissive || 0x000000
                });
            } else if (mat.type === 'MeshBasicMaterial') {
                material = new THREE.MeshBasicMaterial({ color: mat.color || 0xffffff });
            } else {
                material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
            }
            material.userData = mat.userData || {};
            materials.push(material);
        }
        return materials;
    }
    
    /**
     * بناء Mesh من بيانات الرؤوس والأوجه
     */
    buildMeshFromData(data, materials) {
        const geometry = new THREE.BufferGeometry();
        
        // تحويل الرؤوس (vertices)
        const vertices = new Float32Array(data.vertices);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        // الأوجه (faces) - تحتاج إلى indices إذا كانت مثلثات
        if (data.faces) {
            const indices = [];
            for (const face of data.faces) {
                // نفترض أن الوجه عبارة عن [v0, v1, v2] (مثلث)
                indices.push(face[0], face[1], face[2]);
            }
            geometry.setIndex(indices);
        }
        
        // Normal vectors
        if (data.normals) {
            geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
        } else {
            geometry.computeVertexNormals();
        }
        
        // UVs
        if (data.uvs) {
            geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
        }
        
        // تطبيق المواد (إذا كان هناك عدة مواد، نستخدم Group)
        let material = materials[0] || new THREE.MeshStandardMaterial({ color: 0x88aaff });
        const mesh = new THREE.Mesh(geometry, material);
        
        // تطبيق التحويلات (position, rotation, scale)
        if (data.transforms) {
            mesh.position.set(data.transforms.position?.x || 0, data.transforms.position?.y || 0, data.transforms.position?.z || 0);
            mesh.rotation.set(data.transforms.rotation?.x || 0, data.transforms.rotation?.y || 0, data.transforms.rotation?.z || 0);
            mesh.scale.set(data.transforms.scale?.x || 1, data.transforms.scale?.y || 1, data.transforms.scale?.z || 1);
        }
        
        mesh.userData = { name: data.metadata?.name || 'unnamed' };
        return mesh;
    }
    
    /**
     * بناء التسلسل الهرمي (Groups)
     */
    buildHierarchy(parent, hierarchy, materials, modelData) {
        for (const node of hierarchy) {
            let obj;
            if (node.type === 'group') {
                obj = new THREE.Group();
                if (node.children) {
                    this.buildHierarchy(obj, node.children, materials, modelData);
                }
            } else if (node.type === 'mesh') {
                // استخراج بيانات المجسم من modelData أو من node نفسه
                const meshData = modelData.meshes?.find(m => m.id === node.meshId) || node.data;
                if (meshData) {
                    obj = this.buildMeshFromData(meshData, materials);
                } else {
                    obj = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), materials[0]);
                }
            }
            if (obj) {
                obj.name = node.name || 'node';
                if (node.transforms) {
                    obj.position.set(node.transforms.position?.x || 0, node.transforms.position?.y || 0, node.transforms.position?.z || 0);
                    obj.rotation.set(node.transforms.rotation?.x || 0, node.transforms.rotation?.y || 0, node.transforms.rotation?.z || 0);
                    obj.scale.set(node.transforms.scale?.x || 1, node.transforms.scale?.y || 1, node.transforms.scale?.z || 1);
                }
                parent.add(obj);
            }
        }
    }
    
    // ========== دوال تحويل المجسمات ==========
    
    /**
     * تطبيق تحويل على كائن Three.js
     */
    applyTransform(object, transform) {
        if (transform.position) object.position.set(transform.position.x, transform.position.y, transform.position.z);
        if (transform.rotation) object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
        if (transform.scale) object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
    }
    
    /**
     * تدوير الكاميرا حول نقطة مركزية (للتحكم في المحرر)
     */
    rotateCamera(camera, center, deltaTheta, deltaPhi) {
        // تنفيذ بسيط لتحريك الكاميرة OrbitControls سيتم التعامل معه في المحرر باستخدام OrbitControls مباشرة
        // هذه الدالة للمحرك إذا احتاجها
    }
    
    // ========== دوال العمليات الهندسية (Extrude, Boolean, إلخ) ==========
    // سيتم إضافة عمليات بسيطة كأمثلة
    
    extrude(mesh, amount, direction = [0, 1, 0]) {
        // عملية بثق بسيطة: إزالة الوجوه وزيادة الارتفاع
        // هذا مجرد نموذج، التنفيذ الكامل يحتاج إلى مكتبة geometry processing
        console.warn('Extrude operation is not fully implemented in this version.');
        return mesh;
    }
    
    mirror(mesh, axis = 'x') {
        // عكس المجسم حول محور
        mesh.scale[axis] *= -1;
        return mesh;
    }
    
    // ========== دوال الاستيراد / التصدير ==========
    
    /**
     * تصدير مشهد أو مجموعة إلى صيغة النموذج (JSON)
     * @param {THREE.Object3D} root - الكائن المراد تصديره
     * @returns {Object} - بيانات النموذج ككائن جاهز للتحويل إلى JSON
     */
    exportToAsset(root) {
        const asset = {
            version: this.version,
            metadata: root.userData?.metadata || { name: root.name || 'ExportedModel', created: new Date().toISOString() },
            vertices: [],
            faces: [],
            normals: [],
            uvs: [],
            materials: [],
            hierarchy: [],
            transforms: {}
        };
        
        // جمع البيانات من الـ Meshes داخل الكائن (تنفيذ مبسط)
        const meshes = [];
        root.traverse(child => {
            if (child.isMesh) {
                const geometry = child.geometry;
                const positions = geometry.attributes.position.array;
                const indices = geometry.index ? geometry.index.array : [];
                const normalsAttr = geometry.attributes.normal;
                
                // تحويل الرؤوس
                asset.vertices = Array.from(positions);
                
                // تحويل الوجوه
                for (let i = 0; i < indices.length; i += 3) {
                    asset.faces.push([indices[i], indices[i+1], indices[i+2]]);
                }
                
                // تحويل النورمالات
                if (normalsAttr) asset.normals = Array.from(normalsAttr.array);
                
                // تحويل المواد
                const mat = child.material;
                asset.materials.push({
                    type: mat.type,
                    color: mat.color.getHex(),
                    roughness: mat.roughness,
                    metalness: mat.metalness,
                    transparent: mat.transparent,
                    opacity: mat.opacity
                });
                
                // التسلسل الهرمي (مبسط)
                asset.hierarchy.push({
                    name: child.name,
                    type: 'mesh',
                    transforms: {
                        position: { x: child.position.x, y: child.position.y, z: child.position.z },
                        rotation: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
                        scale: { x: child.scale.x, y: child.scale.y, z: child.scale.z }
                    }
                });
            }
        });
        
        return asset;
    }
    
    /**
     * استيراد ملف JSON وتحويله إلى كائن Three.js
     */
    importAsset(jsonData) {
        return this.build(jsonData);
    }
}

// جعل المحرك متاحًا عالميًا (في المتصفح)
window.ModelingEngine = ModelingEngine;

export default ModelingEngine;
